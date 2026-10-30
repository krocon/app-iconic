import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { menu } from './menu-helpers';
import { close, frames, idOf, select } from './selection-helpers';

/**
 * Prompt 084 – symbol sets and the own library (Chromium, browser mode with fakes): a Tabler
 * symbol is found and added; a selection of a transformed group is saved as a symbol through
 * Edit › Save as Symbol… and inserted again from "My Symbols" – same shape (aspect, colours),
 * placed and scaled like every symbol; the search over all sets finds it beside the sets.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'lib.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<g id="logo" transform="translate(100 200) rotate(90)" fill="#00aa55">' +
  '<rect id="r" x="0" y="0" width="200" height="100"/>' +
  '<circle id="c" cx="50" cy="50" r="20" fill="#ff0000" stroke="#000000" stroke-width="4"/>' +
  '</g></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, SVG);
}

/** Bounds (document units) and the colours of the selected node's paths. */
function selected(page: Page) {
  return page.evaluate(() => {
    const h = window.__appIconic!;
    const ref = h.store()!.selection()[0];
    if (!ref) return null;
    const el = h.store()!.document().node(ref)!;
    return {
      tag: el.localName,
      stroke: el.getAttribute('stroke'),
      fills: Array.from(el.querySelectorAll('path')).map((p) => p.getAttribute('fill')),
      bounds: h.nodeBounds(ref.asset, ref.id),
    };
  });
}

async function chooseSet(page: Page, set: string) {
  await page.getByTestId('symbol-set').selectOption(set);
  await expect(page.locator('[data-testid="symbol-grid"] [role="option"]').first()).toBeVisible({
    timeout: 20_000,
  });
}

test('Tabler: search and add a stroke symbol', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('add.symbol'));
  await chooseSet(page, 'tabler');
  await expect(page.locator('app-symbol-picker-dialog')).toContainText('Tabler · MIT License');
  const search = page.getByTestId('symbol-search');
  await search.fill('heart');
  await expect(page.locator('[data-set="tabler"][data-symbol="heart"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await search.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await selected(page))?.tag).toBe('g');
  const s = (await selected(page))!;
  expect(s.stroke).toBe('#000000');
  expect(s.fills.length).toBeGreaterThan(0);
  // the use is remembered: "Recently used" lists it
  await page.evaluate(() => window.__appIconic!.run('add.symbol'));
  await chooseSet(page, 'recent');
  await expect(page.locator('[data-set="tabler"][data-symbol="heart"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('save a selection as symbol and insert it again', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  const logo = await idOf(page, A, '#logo');
  await select(page, A, [logo]);
  const before = (await page.evaluate(([a, id]) => window.__appIconic!.nodeBounds(a, id), [
    A,
    logo,
  ] as const))!;
  // rotated by 90°: 100 wide, 200 high
  close({ x: before.width, y: before.height }, { x: 100, y: 200 }, 0.5);

  await menu(page, 'Edit', 'Save as Symbol…');
  await page.getByTestId('save-symbol-name').fill('Green Pill');
  await page.getByTestId('save-symbol-tags').fill('logo, capsule');
  await page.getByTestId('save-symbol-save').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Saved “Green Pill” in My Symbols.')).toBeVisible();

  // insert beside it, not into the selected group
  await page.evaluate(() => window.__appIconic!.run('edit.deselect'));
  await page.evaluate(() => window.__appIconic!.run('add.symbol'));
  await chooseSet(page, 'mine');
  const tile = page.locator('[data-set="mine"][data-symbol="green-pill"]');
  await expect(tile).toBeVisible();
  // the preview keeps the colours
  await expect(tile.locator('path[fill="#00aa55"]')).toHaveCount(1);
  await page.getByTestId('symbol-size').fill('100');
  await page.getByTestId('symbol-size').dispatchEvent('change');
  await page.getByTestId('symbol-search').press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await selected(page))?.tag).toBe('g');
  await frames(page);
  const s = (await selected(page))!;
  expect(s.fills).toEqual(['#00aa55', '#ff0000']);
  // same shape: as wide as the size, the height in proportion (stroke of the circle inside)
  close({ x: s.bounds!.width, y: s.bounds!.height }, { x: 100, y: 200 }, 0.5);

  // the search over all sets finds it by name and tag
  await page.evaluate(() => window.__appIconic!.run('add.symbol'));
  await chooseSet(page, 'all');
  await page.getByTestId('symbol-search').fill('green capsule');
  await expect(page.locator('[data-set="mine"][data-symbol="green-pill"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('About names every symbol set with its licence', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.__appIconic!.run('app.about'));
  const sets = page.getByTestId('about-symbols');
  await expect(sets).toHaveCount(3);
  await expect(sets.nth(1)).toContainText('Tabler (MIT License)');
  await expect(sets.nth(2)).toContainText('Phosphor (MIT License)');
});
