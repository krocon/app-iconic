import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { menu, menuItem, openMenu } from './menu-helpers';

/**
 * Prompt 003 in the browser mode (fakes with camscanner.icon in memory, test hook
 * `window.__appIconic`, design 003 E14).
 */
const CAM = '/fixtures/camscanner.icon';
const A3 = 'logo-scanner 3.svg';
const A2 = 'logo-scanner-2 2.svg';
const fixture = (name: string) =>
  readFileSync(join(__dirname, '..', 'testdata/fixtures/camscanner.icon/Assets', name), 'utf8');

async function openCamscanner(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle('Untitled');
  await menu(page, 'File', 'Open…');
  await expect(page).toHaveTitle('camscanner.icon');
}

const assetNames = (page: Page) =>
  page.evaluate(() => [...window.__appIconic!.store()!.document().assets.keys()]);

/** Runs `SetAttribute` on the root `<svg>` of an asset through the store. */
async function setRootAttribute(page: Page, asset: string, name: string, value: string) {
  await page.evaluate(
    ([asset, name, value]) => {
      const hook = window.__appIconic!;
      hook.setAttribute(asset, hook.rootId(asset)!, name, value);
    },
    [asset, name, value],
  );
}

/** The live root `<svg>` of an asset in the canvas (the only `<svg>` there with an id, 004 E1). */
const layerSvg = (page: Page, asset: string) =>
  page.locator(`app-canvas-view .layer[data-asset="${asset}"] svg[data-ai-id]`).first();

test('opens camscanner.icon: hierarchy and stacked layers', async ({ page }) => {
  await openCamscanner(page);
  const tree = page.getByRole('region', { name: 'Hierarchy' }).getByRole('tree');
  await expect(tree.locator('[role="treeitem"][data-kind="layer"]')).toHaveText([
    'logo-scanner 3',
    'logo-scanner-2 2',
  ]);
  await expect(page.locator('app-canvas-view .layer')).toHaveCount(2);
  await expect(layerSvg(page, A3).locator('polygon').first()).toBeVisible();
});

test('an attribute change marks the title, undo/redo by button and shortcut', async ({ page }) => {
  await openCamscanner(page);
  await setRootAttribute(page, A3, 'opacity', '0.5');
  await expect(page).toHaveTitle('• camscanner.icon');
  await expect(page.getByTestId('doc-title')).toContainText('Edited');
  await expect(layerSvg(page, A3)).toHaveAttribute('opacity', '0.5');

  const undo = page.getByRole('button', { name: 'Undo Change Attribute' });
  await undo.click();
  await expect(page).toHaveTitle('camscanner.icon');
  await expect(layerSvg(page, A3)).not.toHaveAttribute('opacity', /.*/);
  await expect(page.getByRole('button', { name: 'Redo Change Attribute' })).toBeEnabled();

  await page.locator('body').press('Control+Shift+Z');
  await expect(layerSvg(page, A3)).toHaveAttribute('opacity', '0.5');
  await expect(page).toHaveTitle('• camscanner.icon');
  await page.locator('body').press('Control+Z');
  await expect(page).toHaveTitle('camscanner.icon');
});

test('Save writes only the changed asset; the other stays byte-equal', async ({ page }) => {
  await openCamscanner(page);
  await openMenu(page, 'File');
  await expect(menuItem(page, 'Save')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await setRootAttribute(page, A3, 'opacity', '0.5');
  await menu(page, 'File', 'Save');
  await expect(page).toHaveTitle('camscanner.icon');
  const [changed, unchanged, request] = await page.evaluate(
    ([path, a3, a2]) => {
      const hook = window.__appIconic!;
      return [hook.fileAsset(path, a3), hook.fileAsset(path, a2), hook.files.saved.at(-1)];
    },
    [CAM, A3, A2],
  );
  expect(unchanged).toBe(fixture(A2));
  expect(changed).toContain('opacity="0.5"');
  expect(changed).not.toContain('data-ai-');
  expect(request?.assets).toEqual([
    { name: A3, unchanged: false, text: changed },
    { name: A2, unchanged: true },
  ]);
});

test('Import SVG resolves styles; one undo removes group, layer and asset', async ({ page }) => {
  await openCamscanner(page);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
    '<style>.a { fill: #ff0000; stroke-width: 4px } svg .b { opacity: 0.5 }</style>' +
    '<script>alert(1)</script>' +
    '<g class="b"><rect class="a" width="100px" height="2em" style="stroke: blue"/></g></svg>';
  await page.evaluate(
    (text) => window.__appIconic!.addSvgFile('/in/drop.svg', 'drop.svg', text),
    svg,
  );
  await menu(page, 'File', 'Import SVG…');

  const groups = page.getByRole('tree').locator('[role="treeitem"][data-kind="group"]');
  await expect(groups).toHaveCount(3);
  // on top (design 006 E14)
  await expect(page.getByRole('tree').locator('[data-row="g0/l0"]')).toContainText('drop');
  await expect(page.locator('app-canvas-view .layer')).toHaveCount(3);
  await expect(page.getByRole('status')).toContainText('drop.svg: removed scripts');
  const text = await page.evaluate(() => window.__appIconic!.assetText('drop.svg'));
  expect(text).not.toMatch(/<style|<script|class=/);
  expect(text).toContain('fill="rgb(255, 0, 0)"');
  expect(text).toContain('stroke-width="4"');
  expect(text).toContain('stroke="rgb(0, 0, 255)"');
  expect(text).toMatch(/<g opacity="0.5"/);
  expect(text).toContain('width="100"');
  expect(text).toContain('height="32"');
  await expect(page).toHaveTitle('• camscanner.icon');

  await page.getByRole('button', { name: 'Undo Import SVG' }).click();
  await expect(groups).toHaveCount(2);
  await expect.poll(() => assetNames(page)).toEqual([A3, A2]);
  await expect(page.locator('app-canvas-view .layer')).toHaveCount(2);
  await expect(page).toHaveTitle('camscanner.icon');
});

test('closing with changes asks: Cancel keeps the window, Don’t Save closes', async ({ page }) => {
  await openCamscanner(page);
  await setRootAttribute(page, A2, 'opacity', '0.1');
  await menu(page, 'File', 'Close');
  const question = page.getByRole('alertdialog', { name: /save the changes to “camscanner.icon”/ });
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).toBeHidden();
  expect(await page.evaluate(() => window.__appIconic!.window.closed)).toBe(false);

  // the window's close button asks the same; Escape = Cancel
  await page.evaluate(() => window.__appIconic!.requestClose());
  await expect(question).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(question).toBeHidden();

  await page.keyboard.press('Control+W');
  await question.getByRole('button', { name: 'Don’t Save' }).click();
  await expect.poll(() => page.evaluate(() => window.__appIconic!.window.closed)).toBe(true);
  expect(await page.evaluate(() => window.__appIconic!.files.saved.length)).toBe(0);
});

test('Save As ZIP and Open Recent', async ({ page }) => {
  await openCamscanner(page);
  await setRootAttribute(page, A3, 'opacity', '0.5');
  await menu(page, 'File', 'Save As…');
  const format = page.getByRole('alertdialog', { name: 'Save As' });
  await format.getByRole('button', { name: 'ZIP' }).click();
  await expect(page).toHaveTitle('camscanner.icon');
  const saved = await page.evaluate(() => window.__appIconic!.files.saved.at(-1));
  expect(saved).toMatchObject({ path: '/browser/camscanner.icon', format: 'zip', from: CAM });

  // "Open Recent" is a labelled group of the File menu in the HTML bar (design 005 E8)
  await openMenu(page, 'File');
  const labels = page.getByRole('menu').locator('li[tabindex] .label');
  await expect(labels.filter({ hasText: 'camscanner.icon' })).toHaveCount(2);
  await menuItem(page, 'Clear Menu').click();
  await openMenu(page, 'File');
  await expect(menuItem(page, 'No Recent Items')).toHaveAttribute('aria-disabled', 'true');
  await expect(menuItem(page, 'Clear Menu')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
});

test('New asks about unsaved changes and starts an untitled document', async ({ page }) => {
  await openCamscanner(page);
  await setRootAttribute(page, A3, 'opacity', '0.5');
  await menu(page, 'File', 'New Document');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Don’t Save' }).click();
  await expect(page).toHaveTitle('Untitled');
  await expect.poll(() => assetNames(page)).toEqual(['layer.svg']);
});
