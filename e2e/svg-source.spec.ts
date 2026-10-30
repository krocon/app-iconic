import { expect, Page, test } from '@playwright/test';
import { collectErrors, docPixel, importSvg, setView, waitForCanvas } from './canvas-helpers';
import { menu } from './menu-helpers';
import { frames, idOf, select } from './selection-helpers';

/**
 * Prompt 011 – "Edit SVG…" and "Optimize Path" (Chromium, browser mode with fakes): CodeMirror
 * loads lazily, a colour changed in the source shows on the canvas after Ctrl+Enter, undo brings
 * it back; invalid markup gets a lint marker and blocks Apply; Esc with changes asks; an asset is
 * edited through its layer; the optimizer previews and is one undo step.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'src.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="big" x="0" y="0" width="1024" height="1024" fill="#ff0000"/>' +
  '<path id="line" d="M100 900 L200 900 L300 900.2 L400 900 L500 900" stroke="#000" fill="none"/>' +
  '</svg>';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Edit SVG' });
const tree = (page: Page) => page.getByRole('tree');

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  // plain colours: without the effects approximation (design 010 E13)
  await page.evaluate(() => window.__appIconic!.canvas.set('effects', false));
  await importSvg(page, A, SVG);
  await setView(page, 0.5, 20, 20);
}

async function green(page: Page) {
  const [r, g, b] = await docPixel(page, 200, 450);
  return g > 200 && r < 60 && b < 60;
}

async function red(page: Page) {
  const [r, g, b] = await docPixel(page, 200, 450);
  return r > 200 && g < 60 && b < 60;
}

/**
 * Replaces the whole editor text (insertText: no key events, no auto-close of tags). CodeMirror's
 * Mod is Cmd on macOS (Ctrl+A there = line start), hence ControlOrMeta.
 */
async function setEditorText(page: Page, text: string) {
  const content = dialog(page).locator('.cm-content');
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(text);
}

test('edit a node in the source: colour on the canvas, undo; invalid markup blocks Apply', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  await expect.poll(() => red(page)).toBe(true);
  const rect = await idOf(page, A, '#big');
  await select(page, A, [rect]);

  // from the hierarchy's context menu
  await tree(page).locator(`[data-row="g0/l0/${rect}"]`).click({ button: 'right' });
  await page
    .getByRole('menu', { name: 'Node actions' })
    .getByRole('menuitem', { name: 'Edit SVG…' })
    .click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).locator('.cm-editor')).toBeVisible();
  await expect(dialog(page).locator('.cm-lineNumbers')).toBeVisible();
  await expect(dialog(page).locator('.cm-content')).toContainText('fill="#ff0000"');
  const apply = dialog(page).getByRole('button', { name: 'Apply' });
  await expect(apply).toBeDisabled();

  // invalid → lint marker, message with the position, Apply blocked
  await setEditorText(page, '<rect x="0" y="0" width="1024" height="1024" fill="#00ff00"');
  await expect(dialog(page).getByTestId('svg-source-status')).toContainText('Line 1, column');
  await expect(dialog(page).locator('.cm-lintRange-error')).toHaveCount(1);
  await expect(apply).toBeDisabled();

  // valid → Ctrl+Enter applies
  await setEditorText(
    page,
    '<rect id="big" x="0" y="0" width="1024" height="1024" fill="#00ff00"/>',
  );
  await expect(dialog(page).getByTestId('svg-source-status')).toHaveText('Valid SVG');
  await expect(apply).toBeEnabled();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => green(page)).toBe(true);
  // the new element is selected
  const sel = await page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    return s.document().node(s.selection()[0])?.getAttribute('fill');
  });
  expect(sel).toBe('#00ff00');

  await menu(page, 'Edit', 'Undo Edit SVG Code');
  await expect.poll(() => red(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('Esc with changes asks first; the search panel takes Esc for itself', async ({ page }) => {
  await setup(page);
  await select(page, A, [await idOf(page, A, '#big')]);
  await menu(page, 'Edit', 'Edit SVG…');
  await expect(dialog(page).locator('.cm-editor')).toBeVisible();
  await dialog(page).locator('.cm-content').click();
  // Mod-F (Cmd on macOS) opens CodeMirror's search; Esc closes only the search
  await page.keyboard.press('ControlOrMeta+F');
  await expect(dialog(page).locator('.cm-search')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog(page).locator('.cm-search')).toBeHidden();
  await expect(dialog(page)).toBeVisible();

  await setEditorText(page, '<rect fill="blue"/>');
  await page.keyboard.press('Escape');
  await expect(dialog(page).getByTestId('svg-source-confirm')).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Keep Editing' })).toBeFocused();
  await dialog(page).getByTestId('svg-source-discard').click();
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => red(page)).toBe(true);
});

test('an asset through its layer; Format; the selection stays', async ({ page }) => {
  await setup(page);
  const ok = await page.evaluate(() =>
    window.__appIconic!.run('edit.select', { items: [{ kind: 'layer', group: 0, layer: 0 }] }),
  );
  expect(ok).toBe(true);
  await frames(page);
  await page.getByTestId('properties-edit.editSvg').click();
  await expect(dialog(page).getByTestId('svg-source-subtitle')).toHaveText(`Asset ${A}`);
  await expect(dialog(page).locator('.cm-content')).toContainText('<svg');
  await dialog(page).getByTestId('svg-source-format').click();
  // formatted: one element per line
  await expect(dialog(page).locator('.cm-line')).toHaveCount(5);
  const text = await page.evaluate(() =>
    [...document.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'),
  );
  await setEditorText(page, text.replace('#ff0000', '#00ff00'));
  await dialog(page).getByRole('button', { name: 'Apply' }).click();
  await expect(dialog(page)).toBeHidden();
  await expect.poll(() => green(page)).toBe(true);
  const items = await page.evaluate(() => window.__appIconic!.store()!.items());
  expect(items).toEqual([{ kind: 'layer', group: 0, layer: 0 }]);
  const lines = await page.evaluate((a) => window.__appIconic!.assetText(a)!.split('\n').length, A);
  expect(lines).toBeGreaterThan(3);
});

test('Optimize Path: preview, one undo step', async ({ page }) => {
  await setup(page);
  const path = await idOf(page, A, '#line');
  await select(page, A, [path]);
  await menu(page, 'Modify', 'Optimize Path…');
  const opt = page.getByRole('dialog', { name: 'Optimize Path' });
  await expect(opt).toBeVisible();
  await expect(opt.getByTestId('optimize-summary')).toHaveText('1 path');
  await expect(opt.getByTestId('optimize-points-after')).toHaveText('2');
  await opt.getByTestId('optimize-epsilon').fill('0.01');
  await expect(opt.getByTestId('optimize-points-after')).toHaveText('5');
  await opt.getByTestId('optimize-epsilon').fill('1');
  await opt.getByTestId('optimize-apply').click();
  await expect(opt).toBeHidden();
  const d = () =>
    page.evaluate(
      ([a, id]) =>
        window.__appIconic!.store()!.document().node({ asset: a, id })!.getAttribute('d'),
      [A, path],
    );
  expect(await d()).toBe('M100 900H500');
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await d()).toBe('M100 900 L200 900 L300 900.2 L400 900 L500 900');
});
