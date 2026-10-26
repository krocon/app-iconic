import { expect, test } from '@playwright/test';
import { openIcon } from './canvas-helpers';
import { menu } from './menu-helpers';

/** Prompt 005: actions, menus, keyboard (browser mode = Linux → HTML menu bar, Ctrl). */

test('Ctrl+1/2/3 hide and show the side panels', async ({ page }) => {
  await page.goto('/');
  const region = (name: string) => page.getByRole('region', { name });
  await expect(region('Hierarchy')).toBeVisible();
  await page.locator('body').press('Control+2');
  await expect(region('Hierarchy')).toHaveCount(0);
  await page.locator('body').press('Control+1');
  await page.locator('body').press('Control+3');
  await expect(region('Commands')).toHaveCount(0);
  await expect(region('Properties')).toHaveCount(0);
  await page.locator('body').press('Control+2');
  await expect(region('Hierarchy')).toBeVisible();
  // the canvas takes the free room
  const canvas = await page.locator('app-canvas-view').boundingBox();
  const hierarchy = await region('Hierarchy').boundingBox();
  expect(canvas!.width).toBeGreaterThan(page.viewportSize()!.width - hierarchy!.width - 2);
});

test('the command palette filters and runs an action', async ({ page }) => {
  await openIcon(page);
  await page.locator('body').press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Command Palette' });
  const input = palette.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('zoom 100');
  await expect(palette.getByRole('option')).toHaveCount(0);
  await input.fill('actual');
  await expect(palette.getByRole('option')).toHaveText(['Actual SizeCtrl+0']);
  await page.evaluate(() => window.__appIconic!.canvas.zoomTo(0.5));
  await input.press('Enter');
  await expect(palette).toBeHidden();
  await expect(page.getByTestId('canvas-zoom')).toHaveText('100 %');
});

test('the menu bar works with the keyboard (F10, arrows, Enter, Esc)', async ({ page }) => {
  await page.goto('/');
  await page.locator('body').press('F10');
  const top = (name: string) =>
    page.getByRole('menubar').getByRole('menuitem', { name, exact: true });
  const file = top('File');
  await expect(file).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(top('Edit')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(top('View')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  const view = page.getByRole('menu', { name: 'View' });
  await expect(view).toBeVisible();
  // first item: Command Sidebar (a check item) – Enter toggles the panel
  await expect(view.getByRole('menuitemcheckbox').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(view).toBeHidden();
  await expect(page.getByRole('region', { name: 'Commands' })).toHaveCount(0);
  await page.locator('body').press('F10');
  await expect(file).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'File' })).toBeHidden();
  await expect(file).toBeFocused();
});

test('Undo in the Edit menu names the action; Keyboard Shortcuts lists the chords', async ({
  page,
}) => {
  await openIcon(page);
  await page.evaluate(() => {
    const hook = window.__appIconic!;
    hook.setAttribute('logo-scanner 3.svg', hook.rootId('logo-scanner 3.svg')!, 'opacity', '0.4');
  });
  await page.getByRole('menubar').getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Edit' }).getByRole('menuitem').first()).toHaveText(
    /Undo Change Attribute\s*Ctrl\+Z/,
  );
  await page.keyboard.press('Escape');
  await menu(page, 'Help', 'Keyboard Shortcuts');
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await expect(dialog.getByRole('row', { name: /Import SVG…/ })).toContainText('Ctrl+Shift+I');
  await dialog.getByRole('searchbox').fill('zoom in');
  await expect(dialog.getByRole('row').filter({ hasText: 'Zoom In' })).toContainText('Ctrl+=');
});

test('the AI path: actions with arguments and serialised commands (design 005 E15)', async ({
  page,
}) => {
  await openIcon(page);
  const result = await page.evaluate(() => {
    const hook = window.__appIconic!;
    const root = hook.rootId('logo-scanner 3.svg')!;
    const ran = hook.run('view.zoomTo', { zoom: 1.5 });
    const refused = hook.run('view.zoomTo', { zoom: 'huge' });
    const command = {
      type: 'setAttribute',
      ref: { asset: 'logo-scanner 3.svg', id: root },
      name: 'opacity',
      value: '0.25',
    };
    const ok = hook.run('edit.runCommand', { command: JSON.parse(JSON.stringify(command)) });
    const bad = hook.runCommand({ type: 'setAttribute', ref: { asset: 'x', id: 'n1' } });
    return {
      ran,
      refused,
      ok,
      bad,
      last: hook.lastCommand(),
      zoom: hook.canvas.zoom(),
      described: hook.actions().find((a) => a.id === 'edit.undo'),
    };
  });
  expect(result).toMatchObject({ ran: true, refused: false, ok: true, zoom: 1.5 });
  expect(result.bad).toMatch(/invalid command/);
  expect(result.last).toMatchObject({ type: 'setAttribute', name: 'opacity', value: '0.25' });
  expect(result.described).toMatchObject({ label: 'Undo Change Attribute', enabled: true });
  await expect(page.locator('app-canvas-view .layer svg[opacity="0.25"]')).toHaveCount(1);
  await expect(page).toHaveTitle('• camscanner.icon');
});
