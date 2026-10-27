import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { attr, close, frames, handles, idOf, screenOf, select } from './selection-helpers';

/**
 * Prompt 009 – the properties panel (Chromium, browser mode with fakes): typed values change the
 * canvas live and are ONE undo step, rotate with pivot moves the canvas pivot handle to the right
 * screen point, the transform list equals the browser's own matrix, mixed values of a multiple
 * selection, colour by hex, reset removes the style property.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'props.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<g id="grp" transform="translate(100 50)">' +
  '<rect id="r1" x="100" y="100" width="200" height="100" fill="#ff0000"/>' +
  '<rect id="r2" x="400" y="100" width="100" height="100" fill="#0000ff"/>' +
  '</g></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, SVG);
}

const panel = (page: Page) => page.locator('app-properties-panel');

function bounds(page: Page, id: string) {
  return page.evaluate((id) => window.__appIconic!.nodeBounds('props.svg', id), id);
}

function undoState(page: Page) {
  return page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    return { label: s.undoLabel(), last: window.__appIconic!.lastCommand() };
  });
}

test('empty state, then the properties of the selected rect', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('edit.deselect'));
  await expect(panel(page).getByTestId('properties-empty')).toContainText('Nothing selected');
  await expect(panel(page).getByTestId('properties-empty')).toContainText(
    'Select an element in the hierarchy or on the canvas.',
  );
  await page.evaluate(() => window.__appIconic!.run('edit.select', { items: [{ kind: 'root' }] }));
  await expect(panel(page).getByTestId('properties-items')).toBeVisible();
  await select(page, A, [await idOf(page, A, '#r1')]);
  await expect(panel(page).getByTestId('properties-kind')).toHaveText('rect');
  await expect(page.locator('#prop-width')).toHaveValue('200');
  await expect(page.locator('#prop-fill')).toHaveValue('#ff0000');
  // the inherited / default opacity is a greyed placeholder
  await expect(page.locator('#prop-opacity')).toHaveValue('');
  await expect(page.locator('#prop-opacity')).toHaveAttribute('placeholder', '1');
  expect(errors).toEqual([]);
});

test('typing the width changes the canvas live; undo is ONE step', async ({ page }) => {
  await setup(page);
  const r1 = await idOf(page, A, '#r1');
  await select(page, A, [r1]);
  const before = await bounds(page, r1);
  const labelBefore = (await undoState(page)).label;
  const field = page.locator('#prop-width');
  await field.click();
  await field.fill('');
  await field.pressSequentially('350', { delay: 20 });
  await frames(page);
  // live – before Enter
  expect((await bounds(page, r1))!.width).toBeCloseTo(350, 3);
  await field.press('Enter');
  const after = await undoState(page);
  expect(after.label).toBe('Undo Change Attribute');
  expect(after.last).toEqual({
    type: 'setAttributes',
    changes: [{ ref: { asset: A, id: r1 }, name: 'width', value: '350' }],
  });
  // ↑ with ⇧ steps by 10 (another step)
  await field.press('Shift+ArrowUp');
  await field.press('Enter');
  expect(await attr(page, A, r1, 'width')).toBe('360');
  await panel(page).getByTestId('properties-undo').click();
  expect(await attr(page, A, r1, 'width')).toBe('350');
  await panel(page).getByTestId('properties-undo').click();
  expect(await attr(page, A, r1, 'width')).toBe('200');
  expect((await undoState(page)).label).toBe(labelBefore);
  expect((await bounds(page, r1))!.width).toBeCloseTo(before!.width, 3);
  await panel(page).getByTestId('properties-redo').click();
  expect(await attr(page, A, r1, 'width')).toBe('350');
});

test('Escape takes a typed value back; constrain keeps the ratio', async ({ page }) => {
  await setup(page);
  const r1 = await idOf(page, A, '#r1');
  await select(page, A, [r1]);
  const labelBefore = (await undoState(page)).label;
  const field = page.locator('#prop-height');
  await field.fill('20');
  expect(await attr(page, A, r1, 'height')).toBe('20');
  await field.press('Escape');
  expect(await attr(page, A, r1, 'height')).toBe('100');
  await expect(field).toHaveValue('100');
  expect((await undoState(page)).label).toBe(labelBefore);
  // lock width/height: 200 × 100 → width 300 makes height 150
  await page.getByRole('button', { name: 'Constrain proportions' }).first().click();
  await page.locator('#prop-width').fill('300');
  await page.locator('#prop-width').press('Enter');
  expect(await attr(page, A, r1, 'height')).toBe('150');
  expect((await undoState(page)).last).toMatchObject({
    changes: [
      { name: 'width', value: '300' },
      { name: 'height', value: '150' },
    ],
  });
});

test('rotate with pivot from the panel puts the pivot handle on the pivot', async ({ page }) => {
  await setup(page);
  const r1 = await idOf(page, A, '#r1');
  const grp = await idOf(page, A, '#grp');
  await select(page, A, [r1]);
  await page.getByTestId('transform-add').selectOption('rotate');
  expect(await attr(page, A, r1, 'transform')).toBe('rotate(0)');
  const angle = page.locator('#props-transform-s0-a0');
  await angle.fill('30');
  await angle.press('Enter');
  expect(await attr(page, A, r1, 'transform')).toBe('rotate(30)');
  await page.getByLabel('Use pivot').check();
  // the centre of the rect's bbox (100 + 200/2, 100 + 100/2)
  expect(await attr(page, A, r1, 'transform')).toBe('rotate(30 200 150)');
  const px = page.locator('#props-transform-s0-a1');
  await px.fill('120');
  await px.press('Enter');
  expect(await attr(page, A, r1, 'transform')).toBe('rotate(30 120 150)');
  await frames(page);
  const shown = await handles(page);
  const pivot = Object.entries(shown).find(([k]) => k.endsWith(':pivot'))![1];
  // the rotate works in the rect's parent space (it is the first step)
  close(pivot, await screenOf(page, A, grp, { x: 120, y: 150 }));
  // the raw attribute shows it; invalid text is refused
  const raw = page.getByTestId('transform-raw');
  await expect(raw).toHaveValue('rotate(30 120 150)');
  await raw.fill('rotate(30 120)');
  await expect(page.getByRole('alert')).toContainText('Not a valid transform list');
  await raw.press('Enter');
  expect(await attr(page, A, r1, 'transform')).toBe('rotate(30 120 150)');
  await raw.fill('translate(10,0) rotate(30 120 150)');
  await raw.press('Enter');
  expect(await attr(page, A, r1, 'transform')).toBe('translate(10,0) rotate(30 120 150)');
  // reorder with the arrow button: the translate goes below
  await page.getByRole('button', { name: 'Move step down' }).first().click();
  expect(await attr(page, A, r1, 'transform')).toBe('rotate(30 120 150) translate(10,0)');
});

test('the transform list equals the browser matrix (transform.baseVal)', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  const lists = [
    'translate(10 20) rotate(30 5 5) scale(2 3)',
    'skewX(20) matrix(1 0.2 -0.3 1 4 5) skewY(-10)',
    'rotate(45) translate(3) scale(0.5)',
  ];
  const result = await page.evaluate((lists) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    const out = lists.map((t) => {
      g.setAttribute('transform', t);
      const m = g.transform.baseVal.consolidate()!.matrix;
      return {
        dom: [m.a, m.b, m.c, m.d, m.e, m.f],
        ours: window.__appIconic!.transformListMatrix(t),
      };
    });
    svg.remove();
    return out;
  }, lists);
  for (const r of result) {
    r.dom.forEach((v, i) => expect(r.ours![i]).toBeCloseTo(v, 5));
  }
});

test('multiple selection: mixed, one change for all as one step; reset drops the style', async ({
  page,
}) => {
  await setup(page);
  const r1 = await idOf(page, A, '#r1');
  const r2 = await idOf(page, A, '#r2');
  // import resolves styles into attributes (design 003 E5) – an opened .icon keeps them
  await page.evaluate(
    ([a, id]) => window.__appIconic!.setAttribute(a, id, 'style', 'fill: #00ff00; opacity: 0.8'),
    [A, r2],
  );
  await select(page, A, [r1, r2]);
  await expect(panel(page).getByTestId('properties-kind')).toHaveText('2 items selected');
  const fill = page.locator('#prop-fill');
  await expect(fill).toHaveAttribute('placeholder', 'mixed');
  await expect(page.locator('#prop-width')).toHaveValue('');
  await fill.fill('#123456');
  await fill.press('Enter');
  expect(await attr(page, A, r1, 'fill')).toBe('#123456');
  expect(await attr(page, A, r2, 'fill')).toBe('#123456');
  // the style property went in the same step (else the change would not show)
  expect(await attr(page, A, r2, 'style')).toBe('opacity: 0.8;');
  const s = await undoState(page);
  expect(s.label).toBe('Undo Change Fill');
  expect((s.last as { changes: unknown[] }).changes).toHaveLength(3);
  // reset opacity of r2 alone: attribute and style property go
  await select(page, A, [r2]);
  await page.getByRole('button', { name: 'Reset Opacity' }).click();
  expect(await attr(page, A, r2, 'style')).toBeNull();
  expect((await undoState(page)).label).toBe('Undo Reset Property');
  // Reset All asks first
  await panel(page).getByTestId('properties-reset-all').click();
  await page.getByRole('button', { name: 'Reset All', exact: true }).click();
  expect(await attr(page, A, r2, 'fill')).toBeNull();
  expect(await attr(page, A, r2, 'width')).toBe('100');
  expect((await undoState(page)).label).toBe('Undo Reset All Properties');
});

test('the AI sets what the panel sets (properties.set)', async ({ page }) => {
  await setup(page);
  const r1 = await idOf(page, A, '#r1');
  await select(page, A, [r1]);
  const ok = await page.evaluate(() =>
    window.__appIconic!.run('properties.set', { name: 'stroke-width', value: '7' }),
  );
  expect(ok).toBe(true);
  expect(await attr(page, A, r1, 'stroke-width')).toBe('7');
  await expect(page.locator('#prop-stroke-width')).toHaveValue('7');
});
