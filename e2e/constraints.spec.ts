import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { centerOn, snapping } from './selection-helpers';

/** Prompt 059 – constraints and driving dimensions (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<g transform="translate(40 30)"><rect id="r" x="200" y="300" width="200" height="100" fill="#3b82f6"/></g>' +
  '<line id="l" x1="300" y1="600" x2="500" y2="640" stroke="#000" stroke-width="4"/></svg>';

async function setup(page: Page, zoom = 1) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'cs.svg', SVG);
  await snapping(page, false);
  await centerOn(page, zoom, { x: 400, y: 450 });
  await page.evaluate(() => window.__appIconic!.store()!.selection.set([]));
}

/** Screen point of `(x, y)` in the user space of `#id`. */
function screenOf(page: Page, id: string, x: number, y: number) {
  return page.evaluate(
    ([id, x, y]) => {
      const root = window.__appIconic!.store()!.document().assets.get('cs.svg')!.svg!.root;
      const el = root.querySelector(`#${id}`) as SVGGraphicsElement;
      const p = new DOMPoint(x as number, y as number).matrixTransform(el.getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    [id, x, y] as const,
  );
}

const attrs = (page: Page, id: string, names: string[]) =>
  page.evaluate(
    ([id, names]) => {
      const root = window.__appIconic!.store()!.document().assets.get('cs.svg')!.svg!.root;
      const el = root.querySelector(`#${id}`)!;
      return (names as string[]).map((n) => Number(el.getAttribute(n)));
    },
    [id, names] as const,
  );

for (const zoom of [0.5, 1.5]) {
  test(`a driving dimension: change the value, the rectangle follows (zoom ${zoom * 100} %)`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page, zoom);
    await page.keyboard.press('k');
    await expect(page.getByTestId('constraint-bar')).toBeVisible();
    // fix the top left corner, then a length on the top edge
    await page.locator('[data-testid="constraint-bar"] [data-type="fix"]').click();
    let p = await screenOf(page, 'r', 200, 300);
    await page.mouse.click(p.x, p.y);
    await page.locator('[data-testid="constraint-bar"] [data-type="length"]').click();
    p = await screenOf(page, 'r', 300, 300);
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('constraint-value')).toHaveText('200');
    await expect(page.locator('[data-testid="constraint-badge"][data-type="fix"]')).toBeVisible();
    await page.getByTestId('constraint-value').dispatchEvent('pointerdown');
    const field = page.getByTestId('constraint-value-field');
    await expect(field).toBeFocused();
    await field.fill('320');
    await field.press('Enter');
    expect(await attrs(page, 'r', ['x', 'y', 'width', 'height'])).toEqual([200, 300, 320, 100]);
    await expect(page.getByTestId('constraint-value')).toHaveText('320');
    // one undo step
    await page.evaluate(() => window.__appIconic!.run('edit.undo'));
    expect(await attrs(page, 'r', ['width'])).toEqual([200]);
    expect(errors).toEqual([]);
  });
}

test('horizontal + length: dragging an end keeps both (one undo step)', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const node = doc.refOf(doc.assets.get('cs.svg')!.svg!.root.querySelector('#l')!)!;
    h.run('constraint.add', { type: 'horizontal', refs: [{ node, part: 'line' }] });
    h.run('constraint.add', { type: 'length', refs: [{ node, part: 'line' }], value: 150 });
  });
  let [x1, y1, x2, y2] = await attrs(page, 'l', ['x1', 'y1', 'x2', 'y2']);
  expect(y1).toBeCloseTo(y2, 2);
  expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(150, 1);
  const before = y2;
  await page.keyboard.press('k');
  const from = await screenOf(page, 'l', x2, y2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 40, { steps: 4 });
  await page.mouse.move(from.x + 60, from.y + 80, { steps: 4 });
  await page.mouse.up();
  [x1, y1, x2, y2] = await attrs(page, 'l', ['x1', 'y1', 'x2', 'y2']);
  expect(y1).toBeCloseTo(y2, 2);
  expect(Math.hypot(x2 - x1, y2 - y1)).toBeCloseTo(150, 1);
  expect(y2).toBeGreaterThan(640);
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect((await attrs(page, 'l', ['y2']))[0]).toBeCloseTo(before, 3);
  // stored in the asset (kept in the file, left out of the export – export-svg.spec)
  const svg = await page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('cs.svg')!.svg!.root;
    return root.outerHTML;
  });
  expect(svg).toContain('data-ai-constraints');
  expect(errors).toEqual([]);
});
