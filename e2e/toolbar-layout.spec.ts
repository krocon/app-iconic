import { expect, test } from '@playwright/test';
import { importSvg, waitForCanvas } from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 068 – tools, construction and insert in the sidebar; Modify in its own menu (Chromium,
 * browser mode with fake settings in localStorage).
 */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect x="100" y="100" width="200" height="100"/></svg>';

test('the Rotate tool from the sidebar; Modify is a menu, not a tool', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'tl.svg', SVG);
  await page.evaluate(() => window.__appIconic!.run('edit.selectAll'));
  const side = page.locator('app-command-sidebar');
  await side.locator('[data-group="transform"]').click();
  await page.getByTestId('command-submenu').locator('[data-action="transform.rotate"]').click();
  expect(
    await page.evaluate(
      () => window.__appIconic!.actions().find((a) => a.id === 'transform.rotate')!.checked,
    ),
  ).toBe(true);
  await expect(page.getByTestId('context-name')).toHaveText('Rotate Tool');
  // Offset… is not a tool: only the filter finds it in the sidebar
  await expect(side.locator('[data-action="path.offset"]')).toHaveCount(0);
  await side.getByTestId('command-filter').fill('offset');
  await expect(side.locator('[data-action="path.offset"]')).toHaveCount(1);
  await side.getByTestId('command-filter').fill('');
  // the Modify menu has it
  await menu(page, 'Modify', 'Offset Path…');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('the construction section stays open after a restart', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  const side = page.locator('app-command-sidebar');
  const toggle = side.locator('[data-section-toggle="construction"]');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(side.locator('[data-group="circle"]')).toHaveCount(0);
  await toggle.click();
  await expect(side.locator('[data-group="circle"]')).toHaveCount(1);
  await page.evaluate(() => window.__appIconic!.flushSettings());
  await page.reload();
  await waitForCanvas(page);
  await expect(
    page.locator('app-command-sidebar [data-section-toggle="construction"]'),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('app-command-sidebar [data-group="circle"]')).toHaveCount(1);
});
