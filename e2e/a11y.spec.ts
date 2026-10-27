import { expect, Page, test } from '@playwright/test';
import { openIcon, waitForCanvas } from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 031 – accessibility: every panel is reachable with Tab, the focus is always visible,
 * dialogs are modal (`role="dialog"`, `aria-modal`, focus trap, Esc, focus back). Contrasts of
 * the tokens in light and dark: `scripts/theme-contrast.test.mjs`.
 */
test.use({ viewport: { width: 1440, height: 900 } });

/** Where the focus is and whether it is visible (outline or box-shadow of :focus-visible). */
function focused(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const css = getComputedStyle(el);
    const outline = css.outlineStyle !== 'none' && parseFloat(css.outlineWidth) > 0;
    const shadow = css.boxShadow !== 'none';
    // or a part drawn in the focus colour (the grip of a splitter)
    const probe = document.createElement('i');
    probe.style.color = 'var(--color-focus)';
    document.body.append(probe);
    const focusColor = getComputedStyle(probe).color;
    probe.remove();
    const part = [...el.querySelectorAll('*')].some(
      (c) => getComputedStyle(c).backgroundColor === focusColor,
    );
    const region = el.closest(
      '[role="region"], [role="banner"], [role="menubar"], [role="toolbar"]',
    );
    return {
      label:
        el.getAttribute('aria-label') ??
        el.getAttribute('role') ??
        el.tagName.toLowerCase() + (el.textContent ? `:${el.textContent.trim().slice(0, 20)}` : ''),
      region: region?.getAttribute('aria-label') ?? region?.getAttribute('role') ?? null,
      visible: outline || shadow || part,
      matches: el.matches(':focus-visible'),
    };
  });
}

test('Tab reaches every panel and the focus is always visible', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await openIcon(page);
  // a selection, so that Properties has fields
  await page.getByRole('treeitem').nth(3).click();
  const regions = new Set<string>();
  const invisible: string[] = [];
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    let f = await focused(page);
    if (!f) continue;
    // focus styles may fade in (transitions)
    if (f.matches && !f.visible) {
      await page.waitForTimeout(250);
      f = (await focused(page)) ?? f;
    }
    if (f.region) regions.add(f.region);
    if (f.matches && !f.visible) invisible.push(`${f.region} › ${f.label}`);
  }
  for (const name of ['Commands', 'Hierarchy', 'Properties']) expect([...regions]).toContain(name);
  expect(invisible).toEqual([]);
});

test('dialogs are modal: focus inside, Tab stays inside, Esc closes and gives the focus back', async ({
  page,
}) => {
  await page.goto('/');
  await waitForCanvas(page);
  await openIcon(page);
  const row = page.getByRole('treeitem').nth(3);
  for (const [top, item, name] of [
    ['Help', 'About AppIconic', 'About AppIconic'],
    ['Edit', 'Settings…', 'Settings'],
  ] as const) {
    await row.focus();
    await menu(page, top, item);
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab');
      const inside = await dialog.evaluate((d) => d.contains(document.activeElement));
      expect(inside, `Tab ${i} left the dialog`).toBe(true);
      const f = await focused(page);
      if (f?.matches) expect(f.visible, `${name} › ${f.label}`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // the focus is back where it was before the menu
    await expect(row).toBeFocused();
  }
});
