import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { centerOn, snapping } from './selection-helpers';

/** Prompt 032 – the gradient editor: panel and handles on the canvas (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">' +
  '<stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>' +
  '<g transform="translate(50 20) rotate(30 200 150)">' +
  '<rect id="r" x="100" y="100" width="200" height="100" fill="url(#g)"/></g>' +
  '<circle id="c" cx="700" cy="700" r="80" fill="#00aa00"/></svg>';

async function setup(page: Page, id: string, zoom: number) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'gr.svg', SVG);
  await snapping(page, false);
  await centerOn(page, zoom, { x: 400, y: 400 });
  await page.evaluate((id) => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const el = doc.assets.get('gr.svg')!.svg!.root.querySelector(`#${id}`)!;
    h.store()!.selection.set([doc.refOf(el)!]);
  }, id);
}

/** Screen point of `(x, y)` in the user space of element `#id`. */
function screenOf(page: Page, id: string, x: number, y: number) {
  return page.evaluate(
    ([id, x, y]) => {
      const root = window.__appIconic!.store()!.document().assets.get('gr.svg')!.svg!.root;
      const el = root.querySelector(`#${id}`) as SVGGraphicsElement;
      const p = new DOMPoint(x as number, y as number).matrixTransform(el.getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    [id, x, y] as const,
  );
}

async function handle(page: Page, id: string) {
  const b = (await page.locator(`[data-handle="${id}"]`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const gradAttr = (page: Page, name: string) =>
  page.evaluate(
    (name) =>
      window
        .__appIconic!.store()!
        .document()
        .assets.get('gr.svg')!
        .svg!.root.querySelector('#g')!
        .getAttribute(name),
    name,
  );

for (const zoom of [0.5, 1.5]) {
  test(`handles sit on the gradient in a transformed group and drag it (zoom ${zoom * 100} %)`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page, 'r', zoom);
    await expect(page.getByTestId('gradient-section')).toBeVisible();
    await page.getByTestId('gradient-on-canvas').click();
    for (const [h, x, y] of [
      ['start', 100, 100],
      ['end', 300, 100],
    ] as const) {
      const at = await handle(page, h);
      const want = await screenOf(page, 'r', x, y);
      expect(Math.abs(at.x - want.x)).toBeLessThan(1);
      expect(Math.abs(at.y - want.y)).toBeLessThan(1);
    }
    const from = await handle(page, 'end');
    const to = await screenOf(page, 'r', 200, 150);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 3 });
    await page.mouse.up();
    expect(Number(await gradAttr(page, 'x2'))).toBeCloseTo(0.5, 2);
    expect(Number(await gradAttr(page, 'y2'))).toBeCloseTo(0.5, 2);
    // the whole drag is one undo step, and the rect stayed selected and in place
    await page.evaluate(() => window.__appIconic!.run('edit.undo'));
    expect(await gradAttr(page, 'x2')).toBe('1');
    expect(errors).toEqual([]);
  });
}

test('the panel creates a radial gradient, adds and removes a stop', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page, 'c', 1);
  await page.getByTestId('gradient-create-radial').click();
  const fill = await page.evaluate(() =>
    window
      .__appIconic!.store()!
      .document()
      .assets.get('gr.svg')!
      .svg!.root.querySelector('#c')!
      .getAttribute('fill'),
  );
  expect(fill).toMatch(/^url\(#gradient-\d+\)$/);
  const bar = page.getByTestId('gradient-bar');
  await expect(bar.locator('[data-stop]')).toHaveCount(2);
  const b = (await bar.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(bar.locator('[data-stop]')).toHaveCount(3);
  await page.getByTestId('gradient-remove-stop').click();
  await expect(bar.locator('[data-stop]')).toHaveCount(2);
  await expect(page.getByTestId('gradient-remove-stop')).toBeDisabled();
  // radial handles: centre at the circle's centre
  await page.getByTestId('gradient-on-canvas').click();
  const c = await handle(page, 'center');
  const want = await screenOf(page, 'c', 700, 700);
  expect(Math.abs(c.x - want.x)).toBeLessThan(1);
  expect(Math.abs(c.y - want.y)).toBeLessThan(1);
  expect(errors).toEqual([]);
});
