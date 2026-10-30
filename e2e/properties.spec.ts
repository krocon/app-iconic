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
  await expect(panel(page).locator('app-icon-inspector')).toBeVisible();
  await page.evaluate(() =>
    window.__appIconic!.run('edit.select', {
      items: [{ kind: 'root' }, { kind: 'group', group: 0 }],
    }),
  );
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
  await page.locator('header.toolbar button.undo').click();
  expect(await attr(page, A, r1, 'width')).toBe('350');
  await page.locator('header.toolbar button.undo').click();
  expect(await attr(page, A, r1, 'width')).toBe('200');
  expect((await undoState(page)).label).toBe(labelBefore);
  expect((await bounds(page, r1))!.width).toBeCloseTo(before!.width, 3);
  await page.locator('header.toolbar button.redo').click();
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
  await page
    .locator('[data-section="geometry"]')
    .getByRole('button', { name: 'Constrain proportions' })
    .first()
    .click();
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

test('transform list: the browser computes the matrices (design 009 E7, prompt 033 E3)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForCanvas(page);
  const r = await page.evaluate(() => {
    const h = window.__appIconic!;
    const at = (m: number[], x: number, y: number) => [
      m[0] * x + m[2] * y + m[4],
      m[1] * x + m[3] * y + m[5],
    ];
    const pivot = h.transformPivot('rotate(30) translate(50 0)', 0, 10, 10)!;
    return {
      // a point goes through scale, then rotate about (5,5), then translate (left first, like SVG)
      product: at(h.transformListMatrix('translate(10 20) rotate(90 5 5) scale(2 3)')!, 1, 1),
      skewX: h.transformListMatrix('skewX(45)')!,
      skewY: h.transformListMatrix('skewY(45)')!,
      matrix: h.transformListMatrix('matrix(1 2 3 4 5 6)')!,
      empty: h.transformListMatrix('')!,
      invalid: h.transformListMatrix('rotate(1,)'),
      neutral: h.transformListMatrix(
        'translate(1,2) translate(0 0) scale(1 1) rotate(0) skewX(0) skewY(0) matrix(1 0 0 1 0 0)',
      )!,
      plain: h.transformListMatrix('translate(1 2)')!,
      pivot,
      // the centre stays where it was without rotation: it is the fixed point
      fixed: at(h.transformListMatrix(pivot)!, 10, 10),
      noRot: at(h.transformListMatrix('translate(50 0)')!, 10, 10),
      // T(c)·R·T(−c)
      around: h.transformListMatrix('rotate(90 1 0)')!,
      parts: h.transformListMatrix('translate(1 0) rotate(90) translate(-1 0)')!,
    };
  });
  // scale (2, 3), rotate 90° about (5, 5): (5 − (3 − 5), 5 + (2 − 5)) = (7, 2), translate (10, 20)
  expect(r.product[0]).toBeCloseTo(17, 9);
  expect(r.product[1]).toBeCloseTo(22, 9);
  expect(r.skewX[2]).toBeCloseTo(1, 9);
  expect(r.skewY[1]).toBeCloseTo(1, 9);
  expect(r.matrix).toEqual([1, 2, 3, 4, 5, 6]);
  expect(r.empty).toEqual([1, 0, 0, 1, 0, 0]);
  expect(r.invalid).toBeNull();
  r.neutral.forEach((v, i) => expect(v).toBeCloseTo(r.plain[i], 9));
  expect(r.pivot).toBe('rotate(30 60 10) translate(50 0)');
  expect(r.fixed[0]).toBeCloseTo(r.noRot[0], 9);
  expect(r.fixed[1]).toBeCloseTo(r.noRot[1], 9);
  r.around.forEach((v, i) => expect(v).toBeCloseTo(r.parts[i], 9));
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
  // … and only that declaration: the rest of the attribute stays as written (design 010 E15)
  expect(await attr(page, A, r2, 'style')).toBe('opacity: 0.8');
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
