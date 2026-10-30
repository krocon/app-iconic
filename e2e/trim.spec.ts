import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 050 – Trim and Extend like Fusion 360 (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string, zoom = 1) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 't.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, zoom, { x: 400, y: 400 });
}

async function at(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 3 });
}

async function click(page: Page, x: number, y: number) {
  await at(page, x, y);
  await page.mouse.down();
  await page.mouse.up();
  await frames(page);
}

/** Every shape as tag + bounds (document units, rounded). */
function shapes(page: Page) {
  return page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('t.svg')!.svg!.root;
    return [...root.children].map((e) => {
      const b = (e as SVGGraphicsElement).getBBox();
      return [e.localName, ...[b.x, b.y, b.width, b.height].map((v) => Math.round(v))];
    });
  });
}

const CROSS =
  '<line x1="200" y1="400" x2="600" y2="400" stroke="#000" stroke-width="2"/>' +
  '<line x1="400" y1="200" x2="400" y2="600" stroke="#000" stroke-width="2"/>';

for (const zoom of [0.5, 1.5]) {
  test(`trim the end of a crossed line (zoom ${zoom * 100} %)`, async ({ page }) => {
    const errors = collectErrors(page);
    await setup(page, CROSS, zoom);
    await page.locator('.viewport').focus();
    await page.keyboard.press('t');
    await expect(page.getByTestId('sketch-hint')).toContainText('Trim');
    await at(page, 500, 400);
    await expect(page.getByTestId('trim-overlay').locator('path')).toHaveCount(1);
    await click(page, 500, 400);
    expect(await shapes(page)).toEqual([
      ['path', 200, 400, 200, 0],
      ['line', 400, 200, 0, 400],
    ]);
    expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe('Undo Trim');
    expect(errors).toEqual([]);
  });
}

test('a drag across two pieces trims both in one undo step', async ({ page }) => {
  await setup(page, CROSS);
  await page.evaluate(() => window.__appIconic!.run('trim.tool'));
  await at(page, 300, 380);
  await page.mouse.down();
  await at(page, 300, 400);
  await at(page, 400, 300);
  await at(page, 420, 300);
  await page.mouse.up();
  await frames(page);
  expect(await shapes(page)).toEqual([
    ['path', 400, 400, 200, 0],
    ['path', 400, 400, 0, 200],
  ]);
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect((await shapes(page)).map((s) => s[0])).toEqual(['line', 'line']);
});

test('a circle cut by a line keeps the arc; a line extends to the circle', async ({ page }) => {
  await setup(
    page,
    '<circle cx="400" cy="400" r="100" fill="none" stroke="#000"/>' +
      '<line x1="250" y1="450" x2="550" y2="450" stroke="#000"/>' +
      '<line x1="100" y1="300" x2="200" y2="300" stroke="#000"/>',
  );
  await page.evaluate(() => window.__appIconic!.run('trim.at', { x: 400, y: 500 }));
  await expect.poll(async () => (await shapes(page))[0]).toEqual(['path', 300, 300, 200, 150]);
  await page.evaluate(() => window.__appIconic!.run('extend.tool'));
  await click(page, 200, 300);
  const t = await shapes(page);
  // to where y = 300 meets the circle on the left: x = 400 − √(100² − 100²) = 400
  expect(t[2]).toEqual(['path', 100, 300, 300, 0]);
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe('Undo Extend');
});

test('a locked line is never trimmed but still cuts the others (prompt 064)', async ({ page }) => {
  await setup(
    page,
    '<line x1="200" y1="400" x2="600" y2="400" stroke="#000" stroke-width="2" data-locked="true"/>' +
      '<line x1="400" y1="200" x2="400" y2="600" stroke="#000" stroke-width="2"/>',
  );
  await page.evaluate(() => window.__appIconic!.run('trim.tool'));
  // paper.js is loaded once a piece of the free line lights up
  await at(page, 400, 500);
  await expect(page.getByTestId('trim-overlay').locator('path')).toHaveCount(1);
  // on the locked line: no piece, and a click changes nothing
  await at(page, 500, 400);
  await expect(page.getByTestId('trim-overlay').locator('path')).toHaveCount(0);
  await click(page, 500, 400);
  expect(await shapes(page)).toEqual([
    ['line', 200, 400, 400, 0],
    ['line', 400, 200, 0, 400],
  ]);
  // the other line is cut at the locked one
  await click(page, 400, 500);
  expect(await shapes(page)).toEqual([
    ['line', 200, 400, 400, 0],
    ['path', 400, 200, 0, 200],
  ]);
});
