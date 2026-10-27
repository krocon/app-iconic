import { expect, Page, test } from '@playwright/test';
import { toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, close, frames, snapping } from './selection-helpers';

/**
 * Grid hint (Marc, 27.10.2026): with Snap to Grid on, dots on the grid crossings near the pointer;
 * the nearest crossing sits exactly on its document point at zoom 50 / 100 / 150 %.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const HINT = '[data-testid="grid-hint"]';

async function setup(page: Page, zoom: number, step: number, origin = 'worldZero') {
  await page.goto('/');
  await waitForCanvas(page);
  await page.evaluate(
    ([step, origin]) => {
      const c = window.__appIconic!.canvas;
      c.set('gridSize', step as number);
      c.set('gridOrigin', origin as 'worldZero' | 'svgCenter');
    },
    [step, origin] as const,
  );
  await centerOn(page, zoom, { x: 450, y: 400 });
}

async function hover(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY);
  await frames(page);
}

/** The nearest dot: its document point and its centre in client px. */
function nearest(page: Page) {
  return page.evaluate((sel) => {
    const el = document.querySelector(`${sel} circle.nearest`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      doc: { x: Number(el.getAttribute('data-x')), y: Number(el.getAttribute('data-y')) },
      client: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      count: document.querySelectorAll(`${sel} circle`).length,
    };
  }, HINT);
}

for (const zoom of [0.5, 1, 1.5]) {
  test(`the nearest crossing lies on its document point (zoom ${zoom * 100} %)`, async ({
    page,
  }) => {
    await setup(page, zoom, 20);
    await snapping(page, true, true);
    await hover(page, 433, 418);
    const n = await nearest(page);
    expect(n).not.toBeNull();
    expect(n!.doc).toEqual({ x: 440, y: 420 });
    const c = await toClient(page, 440, 420);
    close(n!.client, { x: c.clientX, y: c.clientY });
    expect(n!.count).toBeGreaterThan(4);
  });
}

test('follows the grid origin', async ({ page }) => {
  await setup(page, 1, 20, 'svgCenter');
  await snapping(page, true, true);
  await hover(page, 433, 418);
  expect((await nearest(page))?.doc).toEqual({ x: 432, y: 412 });
});

test('only while Snap to Grid is on, and not for cells too small on screen', async ({ page }) => {
  await setup(page, 1, 20);
  await snapping(page, true, false);
  await hover(page, 433, 418);
  await expect(page.locator(HINT)).toHaveCount(0);

  await snapping(page, true, true);
  await frames(page);
  await expect(page.locator(HINT)).toHaveCount(1);

  // spacing 10 at 50 %: cells of 5 screen px – no hint
  await page.evaluate(() => window.__appIconic!.canvas.set('gridSize', 10));
  await centerOn(page, 0.5, { x: 450, y: 400 });
  await hover(page, 433, 418);
  await expect(page.locator(HINT)).toHaveCount(0);
});
