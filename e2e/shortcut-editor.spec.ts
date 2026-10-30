import { expect, Page, test } from '@playwright/test';
import { importSvg, waitForCanvas } from './canvas-helpers';

/**
 * Prompt 085 – shortcuts changed in the dialog (browser mode = Linux notation; the fake keeps
 * "keymap.json" in localStorage, a second tab of the same origin is the second window and hears
 * of the change through the `storage` event, design 085 E9).
 */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect x="100" y="100" width="200" height="100"/></svg>';

const rotateOn = (page: Page) =>
  page.evaluate(
    () => window.__appIconic!.actions().find((a) => a.id === 'transform.rotate')!.checked === true,
  );
const rotateShortcut = (page: Page) =>
  page.evaluate(
    () => window.__appIconic!.actions().find((a) => a.id === 'transform.rotate')!.shortcut,
  );

async function rotateRow(page: Page) {
  await page.locator('body').press('Control+/');
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await dialog.getByRole('searchbox').fill('rotate tool');
  const row = dialog.locator('[data-action="transform.rotate"]');
  await expect(row).toHaveCount(1);
  return { dialog, row };
}

test('a new shortcut for the Rotate tool works at once, in every window; Reset', async ({
  page,
}) => {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'r.svg', SVG);
  await page.evaluate(() => window.__appIconic!.run('edit.selectAll'));
  // the second window, open before the change
  const second = await page.context().newPage();
  await second.goto('/');
  await waitForCanvas(second);
  expect(await rotateShortcut(second)).toBe('Shift+R');

  const { dialog, row } = await rotateRow(page);
  await row.getByRole('button', { name: 'Change Shift+R of Rotate Tool' }).click();
  const recorder = row.getByRole('button', { name: 'New shortcut for Rotate Tool' });
  await expect(recorder).toBeFocused();
  // keys run nothing while recording: q is no tool, Shift+R would be Rotate itself
  await page.keyboard.press('q');
  await expect(row.locator('kbd')).toHaveText(['Q']);
  await expect(row).toContainText('changed');
  await expect(dialog).toBeVisible();
  expect(await rotateOn(page)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // works at once: q activates the tool, Shift+R no more
  await page.locator('body').press('Shift+R');
  expect(await rotateOn(page)).toBe(false);
  await page.locator('body').press('q');
  await expect.poll(() => rotateOn(page)).toBe(true);
  await page.evaluate(() => window.__appIconic!.run('tool.select'));
  // the menu tooltip and the second window follow
  expect(await rotateShortcut(page)).toBe('Q');
  await expect.poll(() => rotateShortcut(second)).toBe('Q');
  // a reload reads the saved file again
  await second.reload();
  await waitForCanvas(second);
  expect(await rotateShortcut(second)).toBe('Q');

  // Reset
  const again = await rotateRow(page);
  await again.row.getByRole('button', { name: 'Reset the shortcuts of Rotate Tool' }).click();
  await expect(again.row.locator('kbd')).toHaveText(['Shift+R']);
  await page.keyboard.press('Escape');
  await page.locator('body').press('q');
  expect(await rotateOn(page)).toBe(false);
  await page.locator('body').press('Shift+R');
  await expect.poll(() => rotateOn(page)).toBe(true);
  await expect.poll(() => rotateShortcut(second)).toBe('Shift+R');
  expect(await page.evaluate(() => localStorage.getItem('appIconic.keymap'))).toBe('{}');
});

test('a conflict offers Swap and a reserved shortcut is refused', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  const { row } = await rotateRow(page);
  await row.getByRole('button', { name: 'Add a shortcut to Rotate Tool' }).click();
  await expect(row.locator('[data-recorder]')).toBeFocused();
  await page.keyboard.press('Alt+F4');
  await expect(row.getByRole('status')).toHaveText('Alt+F4 is reserved by the system (Microsoft).');
  await row.getByRole('button', { name: 'Change Shift+R of Rotate Tool' }).click();
  await expect(row.locator('[data-recorder]')).toBeFocused();
  await page.keyboard.press('Shift+S');
  const alert = row.getByRole('alert');
  await expect(alert).toContainText('Shift+S is already used by „Scale Tool“.');
  await alert.getByRole('button', { name: 'Swap' }).click();
  await expect(row.locator('kbd')).toHaveText(['Shift+S']);
  expect(
    await page.evaluate(
      () => window.__appIconic!.actions().find((a) => a.id === 'transform.scale')!.shortcut,
    ),
  ).toBe('Shift+R');
});
