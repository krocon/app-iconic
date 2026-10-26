import { expect, test } from '@playwright/test';

test('the window shell shows panels, canvas and a working About dialog', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Commands' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hierarchy' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Properties' })).toBeVisible();
  await expect(page.getByRole('img', { name: /1024 × 1024 canvas/ })).toBeVisible();

  await page.getByRole('button', { name: 'About' }).click();
  const dialog = page.getByRole('dialog', { name: 'About AppIconic' });
  await expect(dialog).toContainText('desktop backend not available');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
