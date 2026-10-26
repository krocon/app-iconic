import { expect, Page } from '@playwright/test';

/**
 * The HTML menu bar (Windows/Linux, design 005 E8) – Playwright's Chromium reports Linux, so the
 * browser mode shows it. `menu(page, 'File', 'Open…')` opens a menu and chooses an item.
 */
export async function openMenu(page: Page, top: string) {
  await page.getByRole('menubar').getByRole('menuitem', { name: top, exact: true }).click();
  const menu = page.getByRole('menu', { name: top, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

/** An item of an open menu (any of the menu item roles). */
export function menuItem(page: Page, name: string) {
  return page
    .getByRole('menu')
    .locator('li[tabindex]')
    .filter({ has: page.locator('.label', { hasText: new RegExp(`^${escape(name)}$`) }) });
}

export async function menu(page: Page, top: string, item: string): Promise<void> {
  await openMenu(page, top);
  const li = menuItem(page, item);
  await expect(li).toHaveCount(1);
  await li.click();
  await expect(page.getByRole('menu')).toBeHidden();
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
