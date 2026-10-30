import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { menu } from './menu-helpers';

/** Prompt 072 – the tree: inline rename, filter, quick actions, locks on groups and layers. */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<defs><linearGradient id="lg"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
  '<rect id="box" x="100" y="100" width="200" height="200" fill="url(#lg)"/>' +
  '<circle id="dot" cx="600" cy="600" r="80"/></svg>';

const tree = (page: Page) => page.getByRole('tree');
const rowOf = (page: Page, label: string) =>
  tree(page).getByRole('treeitem', { name: label, exact: false }).first();

const attr = (page: Page, id: string, name: string) =>
  page.evaluate(
    ([id, name]) => {
      for (const a of window.__appIconic!.store()!.document().assets.values()) {
        const el = a.svg?.root.querySelector(`[id="${id}"]`);
        if (el) return el.getAttribute(name);
      }
      return null;
    },
    [id, name],
  );

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'tree.svg', SVG);
}

test('double click renames an element; references follow; undo', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await rowOf(page, 'box').locator('.label').dblclick();
  const field = page.getByTestId('tree-rename');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('box');
  await field.fill('card');
  await field.press('Enter');
  await expect(rowOf(page, 'card')).toBeVisible();
  expect(await attr(page, 'card', 'fill')).toBe('url(#lg)');
  await expect(rowOf(page, 'card')).toBeFocused();
  // a taken name is refused
  await page.keyboard.press('F2');
  await page.getByTestId('tree-rename').fill('dot');
  await page.getByTestId('tree-rename').press('Enter');
  await expect(page.getByText('The name “dot” is already used')).toBeVisible();
  expect(await attr(page, 'card', 'id')).toBe('card');
  // undo: the old id
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await attr(page, 'box', 'id')).toBe('box');
  // a layer is renamed the same way; Esc cancels
  await rowOf(page, 'tree').focus();
  await page.keyboard.press('F2');
  await page.getByTestId('tree-rename').fill('Front');
  await page.getByTestId('tree-rename').press('Escape');
  await expect(page.getByTestId('tree-rename')).toHaveCount(0);
  await page.keyboard.press('F2');
  await page.getByTestId('tree-rename').fill('Front');
  await page.getByTestId('tree-rename').press('Enter');
  await expect(tree(page).locator('[data-kind="layer"]', { hasText: 'Front' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('quick actions, expand / collapse all, lock a layer', async ({ page }) => {
  await setup(page);
  const groups = () =>
    page.evaluate(
      () => (window.__appIconic!.store()!.document().iconJson['groups'] as unknown[]).length,
    );
  const before = await groups();
  const layerRows = tree(page).locator('[data-kind="layer"]');
  const layersBefore = await layerRows.count();
  await page.locator('app-tree-toolbar [data-action="add.iconGroup"]').click();
  await expect.poll(groups).toBe(before + 1);
  await page.locator('app-tree-toolbar [data-action="add.layer"]').click();
  // the new group's layer and one more in it
  await expect(layerRows).toHaveCount(layersBefore + 2);
  await page.locator('app-tree-toolbar [data-action="hierarchy.collapseAll"]').click();
  await expect(tree(page).locator('[data-kind="layer"]')).toHaveCount(0);
  await page.locator('app-tree-toolbar [data-action="hierarchy.expandAll"]').click();
  await expect(rowOf(page, 'box')).toBeVisible();
  // lock the layer "tree": its elements are locked, the canvas cannot pick them
  const layer = tree(page).locator('[data-kind="layer"]', { hasText: 'tree' });
  await layer.hover();
  await layer.getByTestId('tree-lock').click();
  await expect(layer.getByTestId('tree-lock')).toHaveClass(/on/);
  await page.evaluate(() => window.__appIconic!.run('edit.selectAll'));
  expect(await page.evaluate(() => window.__appIconic!.store()!.selection().length)).toBe(0);
});

test('the filter finds circles in a big SVG quickly; all by keyboard', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await waitForCanvas(page);
  const text = execFileSync('node', ['scripts/big-svg.mjs', '3000', '--plain'], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
  });
  await page.evaluate(
    (text) => window.__appIconic!.addSvgFile('/in/big.svg', 'big.svg', text),
    text,
  );
  await menu(page, 'File', 'Import SVG…');
  await expect(tree(page)).toContainText('big');
  // Mod+F in the tree focuses the filter
  await tree(page).getByRole('treeitem').first().focus();
  await page.keyboard.press('ControlOrMeta+f');
  const filter = page.getByTestId('tree-filter');
  await expect(filter).toBeFocused();
  const t0 = Date.now();
  await filter.pressSequentially('circle');
  await expect(page.getByTestId('tree-filter-count')).toContainText('matches');
  const ms = Date.now() - t0;
  const rows = tree(page).getByRole('treeitem');
  // the circles carry ids: they match by their tag, their ancestors stay as context
  expect(await rows.count()).toBeGreaterThan(3);
  console.log(`filter "circle" in big.svg: ${ms} ms`);
  expect(ms).toBeLessThan(5000);
  // Enter selects the first match and moves the focus there
  await filter.press('Enter');
  await expect(page.locator('[role="treeitem"][aria-selected="true"]').first()).toBeFocused();
  const tag = await page.evaluate(() => {
    const h = window.__appIconic!;
    return h.store()!.document().node(h.store()!.selection()[0])!.localName;
  });
  expect(tag).toBe('circle');
  // Esc in the filter clears it
  await filter.focus();
  await filter.press('Escape');
  await expect(filter).toHaveValue('');
});
