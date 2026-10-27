import { expect, Page, test } from '@playwright/test';
import { menu, openMenu } from './menu-helpers';

/**
 * Settings, layout and language (prompt 015): splitters limit the panels to 160…480, the
 * settings survive a restart (the browser mode keeps settings.json in localStorage – a reload
 * is the restart), the language switches without one.
 */

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Hierarchy' })).toBeVisible();
}

const width = (page: Page, panel: string) =>
  page.locator(`app-side-panel.${panel}`).evaluate((el) => el.getBoundingClientRect().width);

/** The panel's width once rendered (change detection runs after the event). */
async function expectWidth(page: Page, panel: string, px: number) {
  await expect.poll(() => width(page, panel)).toBeCloseTo(px, 0);
}

async function drag(page: Page, panel: string, dx: number) {
  const box = (await page.locator(`app-splitter[data-panel="${panel}"]`).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 3 });
  await page.mouse.move(x + dx, y, { steps: 3 });
  await page.mouse.up();
}

test('dragging a splitter resizes the panel within 160…480 px', async ({ page }) => {
  await start(page);
  await expectWidth(page, 'hierarchy', 260);
  await drag(page, 'hierarchy', 80);
  await expectWidth(page, 'hierarchy', 340);
  await drag(page, 'hierarchy', 600);
  await expectWidth(page, 'hierarchy', 480);
  await drag(page, 'hierarchy', -900);
  await expectWidth(page, 'hierarchy', 160);
  // the properties splitter sits on the panel's left edge: dragging left widens it
  await drag(page, 'properties', -100);
  await expectWidth(page, 'properties', 400);
  // double-click: default width
  await page.locator('app-splitter[data-panel="properties"]').dblclick();
  await expectWidth(page, 'properties', 300);
});

test('the splitter works with the keyboard (APG window splitter)', async ({ page }) => {
  await start(page);
  const splitter = page.getByRole('separator', { name: 'Resize Commands' });
  await splitter.focus();
  await expect(splitter).toHaveAttribute('aria-valuenow', '260');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(splitter).toHaveAttribute('aria-valuenow', '310');
  await expectWidth(page, 'commands', 310);
  await page.keyboard.press('End');
  await expect(splitter).toHaveAttribute('aria-valuenow', '480');
  await page.keyboard.press('Enter');
  await expect(splitter).toHaveAttribute('aria-valuenow', '260');
});

test('a restart restores widths, panels and canvas options', async ({ page }) => {
  await start(page);
  await drag(page, 'hierarchy', 60);
  await page.keyboard.press('Control+3');
  await expect(page.getByRole('region', { name: 'Properties' })).toBeHidden();
  await menu(page, 'View', 'Rulers');
  await expect(page.locator('app-canvas-ruler')).toHaveCount(0);
  await page.evaluate(() => window.__appIconic!.run('view.selectionMode.boxed'));
  await page.evaluate(() => window.__appIconic!.flushSettings());
  await page.reload();
  await expect(page.getByRole('region', { name: 'Hierarchy' })).toBeVisible();
  await expectWidth(page, 'hierarchy', 320);
  await expect(page.getByRole('region', { name: 'Properties' })).toBeHidden();
  await expect(page.locator('app-canvas-ruler')).toHaveCount(0);
  const s = await page.evaluate(() => window.__appIconic!.settings());
  expect(s.canvas.selectionMode).toBe('boxed');
  expect(s.panels.hierarchy.width).toBe(320);
  expect(await page.evaluate(() => window.__appIconic!.canvas.options().selectionMode)).toBe(
    'boxed',
  );
});

test('switching the language changes the texts without a restart', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Language').selectOption('de');
  await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.getByRole('button', { name: 'Schließen' }).click();
  await expect(page.getByRole('region', { name: 'Hierarchie' })).toBeVisible();
  const datei = await openMenu(page, 'Datei');
  await expect(datei.getByText('Öffnen …')).toBeVisible();
  await page.keyboard.press('Escape');
  // and back, still without a restart
  await page.evaluate(() =>
    window.__appIconic!.run('settings.set', { key: 'language', value: 'en' }),
  );
  await expect(page.getByRole('region', { name: 'Hierarchy' })).toBeVisible();
  // the language survives a restart
  await page.evaluate(() =>
    window.__appIconic!.run('settings.set', { key: 'language', value: 'de' }),
  );
  await page.evaluate(() => window.__appIconic!.flushSettings());
  await page.reload();
  await expect(page.getByRole('region', { name: 'Eigenschaften' })).toBeVisible();
});

test('theme, reset with confirmation and settings.set', async ({ page }) => {
  await start(page);
  await page.evaluate(() =>
    window.__appIconic!.run('settings.set', { key: 'theme', value: 'dark' }),
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(23, 25, 29)');
  expect(
    await page.evaluate(() =>
      window.__appIconic!.run('settings.set', { key: 'panels.commands.width', value: 'wide' }),
    ),
  ).toBe(false);
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('tab', { name: 'Advanced' }).click();
  await dialog.getByRole('button', { name: 'Reset to Default…' }).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText(
    'All persisted workspace settings will revert to their defaults.',
  );
  await ask.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
});
