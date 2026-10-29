import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/**
 * Prompt 047 – Pathfinder, Shape Builder and the cuts (Chromium, browser mode, paper.js lazy).
 */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

const TWO_CIRCLES =
  '<circle cx="350" cy="400" r="100" fill="#f00"/><circle cx="450" cy="400" r="100" fill="#00f"/>';

async function setup(page: Page, body: string) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'pf.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const els = [...doc.assets.get('pf.svg')!.svg!.root.querySelectorAll('circle, rect, path')];
    h.store()!.selection.set(els.map((el) => doc.refOf(el)!));
  });
}

async function at(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 4 });
}

/** The shapes of the asset: tag, fill and (for paths) the covered area measured by the browser. */
function shapes(page: Page) {
  return page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    const root = doc.assets.get('pf.svg')!.svg!.root;
    return [...root.children].map((e) => {
      const b = (e as SVGGraphicsElement).getBBox();
      return {
        tag: e.localName,
        fill: e.getAttribute('fill'),
        box: [b.x, b.y, b.width, b.height].map((v) => Math.round(v)),
      };
    });
  });
}

test('Unite two circles: one path with the front look, one undo step', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page, TWO_CIRCLES);
  await page.evaluate(() => window.__appIconic!.run('pathfinder.unite'));
  await expect.poll(async () => (await shapes(page)).length).toBe(1);
  const [s] = await shapes(page);
  expect(s).toEqual({ tag: 'path', fill: '#00f', box: [250, 300, 300, 200] });
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Pathfinder',
  );
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect((await shapes(page)).map((x) => x.tag)).toEqual(['circle', 'circle']);
  expect(errors).toEqual([]);
});

test('Minus Front and Divide', async ({ page }) => {
  await setup(page, TWO_CIRCLES);
  await page.evaluate(() => window.__appIconic!.run('pathfinder.minusFront'));
  await expect.poll(async () => (await shapes(page)).length).toBe(1);
  expect((await shapes(page))[0]).toEqual({ tag: 'path', fill: '#f00', box: [250, 300, 150, 200] });
  await setup(page, TWO_CIRCLES);
  await page.evaluate(() => window.__appIconic!.run('pathfinder.divide'));
  await expect.poll(async () => (await shapes(page)).length).toBe(3);
  expect((await shapes(page)).map((s) => s.fill).sort()).toEqual(['#00f', '#00f', '#f00']);
});

test('Shape Builder: a drag merges two faces, Alt + click deletes one', async ({ page }) => {
  await setup(page, TWO_CIRCLES);
  await page.keyboard.press('Shift+M');
  await expect(page.getByTestId('sketch-hint')).toContainText('Shape Builder');
  await at(page, 300, 400);
  await expect(page.getByTestId('pathfinder-overlay').locator('path')).toHaveCount(1);
  await page.mouse.down();
  await at(page, 400, 400);
  await page.mouse.up();
  await expect.poll(async () => (await shapes(page)).length).toBe(2);
  const s = await shapes(page);
  expect(s.map((x) => x.box)).toContainEqual([250, 300, 200, 200]);
  // the right lune goes with Alt
  await at(page, 520, 400);
  await page.keyboard.down('Alt');
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await shapes(page)).length).toBe(1);
  expect((await shapes(page))[0].box).toEqual([250, 300, 200, 200]);
});

test('Knife cuts a rectangle in two; Rectangle Cut splits inside and outside', async ({ page }) => {
  await setup(page, '<rect x="300" y="300" width="200" height="200" fill="#0a0"/>');
  await page.evaluate(() => window.__appIconic!.run('cut.knife'));
  await at(page, 400, 250);
  await page.mouse.down();
  await at(page, 410, 400);
  await at(page, 400, 550);
  await page.mouse.up();
  await expect.poll(async () => (await shapes(page)).length).toBe(2);
  expect((await shapes(page)).every((s) => s.tag === 'path' && s.fill === '#0a0')).toBe(true);
  await setup(page, '<rect x="300" y="300" width="200" height="200" fill="#0a0"/>');
  await page.evaluate(() => window.__appIconic!.run('cut.rectCut'));
  await at(page, 350, 350);
  await page.mouse.down();
  await at(page, 600, 600);
  await page.mouse.up();
  await expect.poll(async () => (await shapes(page)).length).toBe(2);
  expect((await shapes(page)).map((s) => s.box)).toContainEqual([350, 350, 150, 150]);
});
