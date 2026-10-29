import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 051 – Fillet and Chamfer between outlines (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'f.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
}

async function click(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await frames(page);
}

function shapes(page: Page) {
  return page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('f.svg')!.svg!.root;
    return [...root.children].map((e) => {
      const b = (e as SVGGraphicsElement).getBBox();
      return [e.localName, ...[b.x, b.y, b.width, b.height].map((v) => Math.round(v))];
    });
  });
}

test('two lines: click one, then the other, radius 30 – one undo step', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(
    page,
    '<line x1="200" y1="500" x2="500" y2="500" stroke="#000"/><line x1="500" y1="500" x2="500" y2="200" stroke="#000"/>',
  );
  await page.evaluate(() => window.__appIconic!.run('fillet.tool'));
  await click(page, 300, 500);
  await expect(page.getByTestId('sketch-hint')).toContainText('second');
  await click(page, 500, 300);
  const size = page.locator('[data-field="size"]');
  await size.fill('30');
  await expect.poll(async () => (await shapes(page))[0][0]).toBe('path');
  await page.getByTestId('fillet-ok').click();
  expect(await shapes(page)).toEqual([
    ['path', 200, 470, 300, 30],
    ['path', 500, 200, 0, 270],
  ]);
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe('Undo Fillet');
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect((await shapes(page)).map((s) => s[0])).toEqual(['line', 'line']);
  expect(errors).toEqual([]);
});

test('a corner of a path with a curved side; chamfer of a rectangle corner; too large', async ({
  page,
}) => {
  await setup(
    page,
    '<path d="M 200 500 L 450 500 C 450 400 500 300 600 300" fill="none" stroke="#000"/>' +
      '<rect x="300" y="100" width="100" height="100" fill="#f80"/>',
  );
  await page.evaluate(() => window.__appIconic!.run('fillet.tool'));
  await click(page, 450, 500);
  await page.locator('[data-field="size"]').fill('20');
  await page.getByTestId('fillet-ok').click();
  const d = await page.evaluate(() =>
    window
      .__appIconic!.store()!
      .document()
      .assets.get('f.svg')!
      .svg!.root.querySelector('path')!
      .getAttribute('d'),
  );
  expect(d).not.toContain('L 450 500');
  await page.evaluate(() => window.__appIconic!.run('chamfer.tool'));
  await click(page, 400, 200);
  await page.locator('[data-field="size"]').fill('500');
  await expect(page.getByTestId('fillet-error')).toContainText('too large');
  await page.locator('[data-field="size"]').fill('20');
  await expect(page.getByTestId('fillet-error')).toHaveText('');
  await page.getByTestId('fillet-ok').click();
  const s = await shapes(page);
  expect(s[1]).toEqual(['path', 300, 100, 100, 100]);
});

test('fillet.at for the AI', async ({ page }) => {
  await setup(
    page,
    '<line x1="200" y1="500" x2="500" y2="500" stroke="#000"/><line x1="500" y1="500" x2="500" y2="200" stroke="#000"/>',
  );
  await page.evaluate(() =>
    window.__appIconic!.run('fillet.at', {
      a: { x: 300, y: 500 },
      b: { x: 500, y: 300 },
      radius: 50,
    }),
  );
  await expect
    .poll(() => shapes(page))
    .toEqual([
      ['path', 200, 450, 300, 50],
      ['path', 500, 200, 0, 250],
    ]);
});
