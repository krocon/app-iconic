import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 053 – transform with a pivot and numbers (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string, zoom = 1) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'x.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, zoom, { x: 400, y: 400 });
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    h.store()!.selection.set([doc.refOf(doc.assets.get('x.svg')!.svg!.root.querySelector('#s')!)!]);
  });
}

async function at(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 4 });
}

/** The corners of #s (and its copies) in document units, rounded. */
function corners(page: Page) {
  return page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('x.svg')!.svg!.root;
    const ref = root.getScreenCTM()!.inverse();
    return [...root.querySelectorAll('rect')].map((r) => {
      const m = ref.multiply(r.getScreenCTM()!);
      const b = r.getBBox();
      return [
        [b.x, b.y],
        [b.x + b.width, b.y + b.height],
      ].map(([x, y]) => {
        const p = new DOMPoint(x, y).matrixTransform(m);
        return [Math.round(p.x), Math.round(p.y)];
      });
    });
  });
}

const RECT = '<rect id="s" x="300" y="300" width="100" height="50" fill="#f80"/>';

for (const zoom of [0.5, 1.5]) {
  test(`rotate tool: click sets the pivot at a corner, ⇧-drag turns 90° (zoom ${zoom * 100} %)`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page, RECT, zoom);
    await page.locator('.viewport').focus();
    await page.keyboard.press('Shift+R');
    await expect(page.getByTestId('transform-overlay')).toBeVisible();
    await at(page, 300, 300);
    await page.mouse.down();
    await page.mouse.up();
    await at(page, 400, 300);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await at(page, 360, 360);
    await at(page, 300, 390);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await frames(page);
    expect(await corners(page)).toEqual([
      [
        [300, 300],
        [250, 400],
      ],
    ]);
    expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
      'Undo Transform',
    );
    expect(errors).toEqual([]);
  });
}

test('dialog: scale 200 % about the top-left, as a copy; inside a rotated group', async ({
  page,
}) => {
  await setup(page, `<g transform="rotate(30 400 400)">${RECT}</g>`);
  const before = await corners(page);
  await page.evaluate(() => window.__appIconic!.run('transform.dialog'));
  await page.locator('[data-field="sx"]').fill('200');
  await page.locator('[data-field="sy"]').fill('200');
  await page.locator('[data-anchor="tl"]').click();
  await page.locator('[data-field="copy"]').check();
  await expect.poll(async () => (await corners(page)).length).toBe(2);
  await page.getByTestId('transform-ok').click();
  const after = await corners(page);
  expect(after[0]).toEqual(before[0]);
  // the copy: twice as large, its box grows from the selection box's top left
  const [a, b] = after[1];
  const [c, d] = before[0];
  expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(
    2 * Math.hypot(d[0] - c[0], d[1] - c[1]),
    -1,
  );
});

test('transform.apply: reflect horizontally about a point; move', async ({ page }) => {
  await setup(page, RECT);
  await page.evaluate(() =>
    window.__appIconic!.run('transform.apply', { reflect: 'horizontal', pivot: [500, 0] }),
  );
  expect(await corners(page)).toEqual([
    [
      [700, 300],
      [600, 350],
    ],
  ]);
  await page.evaluate(() => window.__appIconic!.run('transform.apply', { dx: -100, dy: 20 }));
  expect(await corners(page)).toEqual([
    [
      [600, 320],
      [500, 370],
    ],
  ]);
});
