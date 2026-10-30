import { expect, test } from '@playwright/test';
import { collectErrors, waitForCanvas } from './canvas-helpers';

/** Prompt 069 – appearance and mask at one click, Save / Export in the toolbar, one Undo. */
test.use({ viewport: { width: 1440, height: 900 } });

test('Dark at one click: the preview and the menu check follow; keys move in the group', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForCanvas(page);
  const appearance = page.getByTestId('segment-appearance');
  await appearance.locator('[data-action="view.appearance.dark"]').click();
  expect(await page.evaluate(() => window.__appIconic!.canvas.options().appearance)).toBe('dark');
  await expect(appearance.locator('[data-action="view.appearance.dark"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  // the menus read the same action state
  expect(
    await page.evaluate(
      () => window.__appIconic!.actions().find((a) => a.id === 'view.appearance.dark')!.checked,
    ),
  ).toBe(true);
  // the mask group with the keyboard: → from Squircle to Circle
  const mask = page.getByTestId('segment-mask');
  await mask.locator('[aria-checked="true"]').focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__appIconic!.canvas.options().mask)).toBe('circle');
  await expect(mask.locator('[data-action="view.mask.circle"]')).toBeFocused();
  expect(errors).toEqual([]);
});

test('Export… opens the dialog; Undo / Redo exist only once', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.getByTestId('toolbar-export').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('button.undo')).toHaveCount(1);
  await expect(page.getByTestId('properties-undo')).toHaveCount(0);
  await expect(page.getByTestId('toolbar-save')).toBeVisible();
});
