import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 057 – small sizes preview and pixel grid (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(
    page,
    'p.svg',
    svg('<rect id="r" x="100" y="100" width="200" height="200" fill="#f00"/>'),
  );
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
}

test('the small preview follows a change of the document', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('view.smallPreview'));
  const img = page.getByTestId('small-preview').locator('img[data-size="64"]');
  await expect(img).toBeVisible();
  const before = await img.getAttribute('src');
  expect(decodeURIComponent(before!)).toContain('#f00');
  await page.evaluate(() =>
    window.__appIconic!.run('add.circle', { cx: 700, cy: 700, r: 100, fill: '#00f' }),
  );
  await expect
    .poll(async () => decodeURIComponent((await img.getAttribute('src'))!))
    .toContain('#00f');
  expect(errors).toEqual([]);
});

test('pixel grid 32: drawn, snapping to 32-unit cells; align to pixels', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('view.pixelGrid.32'));
  await frames(page);
  await expect(page.getByTestId('pixel-grid')).toBeVisible();
  const opts = await page.evaluate(() => {
    const o = window.__appIconic!.canvas.options();
    return [o.snapToGrid, o.gridSize];
  });
  expect(opts).toEqual([true, 32]);
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    h.store()!.selection.set([doc.refOf(doc.assets.get('p.svg')!.svg!.root.querySelector('#r')!)!]);
    h.run('arrange.alignToPixels');
  });
  const box = await page.evaluate(() => {
    const el = window
      .__appIconic!.store()!
      .document()
      .assets.get('p.svg')!
      .svg!.root.querySelector('#r') as SVGGraphicsElement;
    const m = (el.ownerSVGElement as SVGGraphicsElement)
      .getScreenCTM()!
      .inverse()
      .multiply(el.getScreenCTM()!);
    const b = el.getBBox();
    const p = new DOMPoint(b.x, b.y).matrixTransform(m);
    return [Math.round(p.x), Math.round(p.y)];
  });
  expect(box).toEqual([96, 96]);
});
