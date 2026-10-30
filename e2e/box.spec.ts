import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, setView, waitForCanvas } from './canvas-helpers';
import { frames, idOf, select } from './selection-helpers';

/**
 * Prompt 062 – the box head of the properties panel (Chromium, browser mode with fakes): X, Y,
 * W, H and rotation for groups in transformed parents, paths and mixed selections, measured in
 * document units at any zoom; typing is one undo step, Undo restores the SVG exactly.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'box.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<g transform="translate(100 50)"><g id="g1" transform="scale(2)">' +
  '<rect id="r1" x="10" y="20" width="50" height="40" fill="#c33"/></g></g>' +
  '<rect id="r2" x="600" y="600" width="100" height="50" fill="#33c"/>' +
  '<circle id="c1" cx="800" cy="200" r="50" fill="#3c3"/>' +
  '<path id="p1" d="M300 600h200v100h-200z" fill="#cc3"/></svg>';

async function setup(page: Page, zoom = 1) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, SVG);
  await setView(page, zoom, 40, 40);
}

async function selectIds(page: Page, ...ids: string[]) {
  const refs = [];
  for (const id of ids) refs.push(await idOf(page, A, `#${id}`));
  await select(page, A, refs);
}

const field = (page: Page, name: string) => page.locator(`#box-${name}`);

async function bounds(page: Page, id: string) {
  const ref = await idOf(page, A, `#${id}`);
  return page.evaluate(([a, r]) => window.__appIconic!.nodeBounds(a, r)!, [A, ref]);
}

async function type(page: Page, name: string, value: string) {
  const f = field(page, name);
  await f.fill(value);
  await f.press('Enter');
  await frames(page);
}

for (const zoom of [0.5, 1, 1.5]) {
  test(`a group in a transformed parent: X/Y/W/H in document units (zoom ${zoom})`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page, zoom);
    await selectIds(page, 'g1');
    await expect(page.getByTestId('box-section')).toBeVisible();
    await expect(field(page, 'x')).toHaveValue('120');
    await expect(field(page, 'y')).toHaveValue('90');
    await expect(field(page, 'width')).toHaveValue('100');
    await expect(field(page, 'height')).toHaveValue('80');
    await expect(field(page, 'rotation')).toHaveValue('0');
    await type(page, 'x', '300');
    const b = await bounds(page, 'g1');
    expect(b.x).toBeCloseTo(300, 4);
    expect(b.y).toBeCloseTo(90, 4);
    await expect(field(page, 'x')).toHaveValue('300');
    expect(errors).toEqual([]);
  });
}

test('W/H with the lock; the reference point decides where it grows', async ({ page }) => {
  await setup(page);
  await selectIds(page, 'r2');
  await page.getByTestId('box-lock').click();
  await page.locator('[data-testid="box-pivot"] [data-anchor="c"]').click();
  await type(page, 'width', '200');
  const b = await bounds(page, 'r2');
  expect(b.width).toBeCloseTo(200, 4);
  expect(b.height).toBeCloseTo(100, 4);
  expect(b.x + b.width / 2).toBeCloseTo(650, 4);
  expect(b.y + b.height / 2).toBeCloseTo(625, 4);
  // X/Y now show the centre
  await expect(field(page, 'x')).toHaveValue('650');
});

test('a rect and a circle together: the box around both, one undo step', async ({ page }) => {
  await setup(page);
  await selectIds(page, 'r2', 'c1');
  await expect(field(page, 'x')).toHaveValue('600');
  await expect(field(page, 'y')).toHaveValue('150');
  await expect(field(page, 'width')).toHaveValue('250');
  await expect(field(page, 'height')).toHaveValue('500');
  // several elements: rotation is relative
  await expect(field(page, 'rotation')).toHaveValue('');
  await type(page, 'width', '500');
  const r = await bounds(page, 'r2');
  const c = await bounds(page, 'c1');
  expect(r.x).toBeCloseTo(600, 4);
  expect(c.x + c.width).toBeCloseTo(1100, 4);
  const undo = await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(undo).toBe(true);
  expect((await bounds(page, 'c1')).x).toBeCloseTo(750, 4);
});

test('a path: rotate 30°, then Undo gives the SVG back byte for byte', async ({ page }) => {
  await setup(page, 1.5);
  const before = await page.evaluate((a) => window.__appIconic!.assetText(a), A);
  await selectIds(page, 'p1');
  await type(page, 'rotation', '30');
  await expect(field(page, 'rotation')).toHaveValue('30');
  await expect(field(page, 'width')).toHaveValue('200');
  await expect(field(page, 'height')).toHaveValue('100');
  // typing on: the rotated frame keeps its size along its own axes
  await type(page, 'width', '300');
  await expect(field(page, 'width')).toHaveValue('300');
  await expect(field(page, 'rotation')).toHaveValue('30');
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await page.evaluate((a) => window.__appIconic!.assetText(a), A)).toBe(before);
});

test('flip buttons and the AI action; locked elements are read only', async ({ page }) => {
  await setup(page);
  await selectIds(page, 'r2');
  await page.getByTestId('box-flip-h').click();
  const t = await page.evaluate(
    (a) =>
      window
        .__appIconic!.store()!
        .document()
        .assets.get(a)!
        .svg!.root.querySelector('#r2')!
        .getAttribute('transform'),
    A,
  );
  expect(t).toBeTruthy();
  expect((await bounds(page, 'r2')).x).toBeCloseTo(600, 4);
  expect(
    await page.evaluate(() =>
      window.__appIconic!.run('properties.box', { x: 10, y: 20, pivot: 'tl' }),
    ),
  ).toBe(true);
  const b = await bounds(page, 'r2');
  expect(b.x).toBeCloseTo(10, 4);
  expect(b.y).toBeCloseTo(20, 4);
  await page.evaluate(() => window.__appIconic!.run('edit.toggleLock'));
  // locked nodes leave the selection; the tree may still select them
  await selectIds(page, 'r2');
  await expect(field(page, 'x')).toBeDisabled();
  await expect(page.getByTestId('box-section')).toContainText('Locked');
  expect(await page.evaluate(() => window.__appIconic!.run('properties.box', { x: 50 }))).toBe(
    false,
  );
});

test('typing is live; Escape takes it back without an undo step', async ({ page }) => {
  await setup(page);
  await selectIds(page, 'r2');
  const undoBefore = await page.evaluate(
    () => window.__appIconic!.actions().find((a) => a.id === 'edit.undo')!.label,
  );
  const f = field(page, 'x');
  await f.fill('100');
  await frames(page);
  expect((await bounds(page, 'r2')).x).toBeCloseTo(100, 4);
  await f.press('Escape');
  await frames(page);
  expect((await bounds(page, 'r2')).x).toBeCloseTo(600, 4);
  expect(
    await page.evaluate(
      () => window.__appIconic!.actions().find((a) => a.id === 'edit.undo')!.label,
    ),
  ).toBe(undoBefore);
});
