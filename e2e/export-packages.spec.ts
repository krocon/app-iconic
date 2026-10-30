import { expect, Page, test } from '@playwright/test';
import { collectErrors, openIcon } from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 078 – package exports (Chromium, browser mode with the fake export backend): the dialog
 * with the Xcode icon set, `.icns`, `.ico`; the macOS frame painted by the browser; Export Again
 * and Copy as PNG (⇧⌘C / Ctrl+Shift+C).
 */
test.use({ viewport: { width: 1440, height: 900 } });

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Export' });
const exported = (page: Page) =>
  page.evaluate(() => [...window.__appIconic!.exporter.files.keys()]);

test('File › Export Xcode Icon Set…: platforms, Xcode hint, folder with Contents.json', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openIcon(page);
  await menu(page, 'File', 'Export Xcode Icon Set…');
  const d = dialog(page);
  await expect(d.getByTestId('export-format-appiconset')).toBeChecked();
  await expect(d.getByTestId('export-format-hint')).toContainText('Xcode 26');
  await expect(d.getByTestId('export-mask')).toHaveCount(0);
  await expect(d.getByTestId('export-size-1024')).toHaveCount(0);
  await expect(d.getByTestId('export-appearance-light')).toBeDisabled();
  await d.getByTestId('export-appearance-tinted').check();
  await d.getByTestId('export-platform-macos').uncheck();
  await d.getByTestId('export-platform-watchos').check();
  // Contents.json, iOS default, dark, tinted, watchOS
  await expect(d).toContainText('5 files');
  await d.getByTestId('export-choose').click();
  await d.getByTestId('export-run').click();
  await expect(d.getByTestId('export-result')).toHaveText('Exported 5 files.');
  expect(await exported(page)).toEqual([
    '/export/AppIcon.appiconset',
    '/export/AppIcon.appiconset/Contents.json',
    '/export/AppIcon.appiconset/ios-1024.png',
    '/export/AppIcon.appiconset/ios-1024-dark.png',
    '/export/AppIcon.appiconset/ios-1024-tinted.png',
    '/export/AppIcon.appiconset/watchos-1024.png',
  ]);
  await expect(d.getByTestId('export-reveal')).toBeVisible();
  // .ico: the mask comes back, appearances go
  await d.getByTestId('export-format-ico').check();
  await expect(d.getByTestId('export-mask')).toBeVisible();
  await expect(d.getByTestId('export-appearance-dark')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the macOS frame: 824 squircle with margin, transparent outside (browser paints it)', async ({
  page,
}) => {
  await openIcon(page);
  await page.evaluate(() => window.__appIconic!.run('file.exportIcns', { targetDir: '/x' }));
  await expect
    .poll(() => page.evaluate(() => window.__appIconic!.exporter.packages.length))
    .toBe(1);
  const alpha = await page.evaluate(async () => {
    const svg = window.__appIconic!.exporter.packages[0].sources[0].svg;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0, 1024, 1024);
    const a = (x: number, y: number) => g.getImageData(x, y, 1, 1).data[3];
    // margin, rounded corner of the body, centre, just inside the left edge
    return [a(50, 512), a(110, 110), a(512, 512), a(105, 512)];
  });
  expect(alpha[0]).toBe(0);
  expect(alpha[1]).toBeLessThan(40); // only the soft shadow in the cut-off corner
  expect(alpha[2]).toBe(255);
  expect(alpha[3]).toBe(255);
});

test('Export Again repeats the last export; Copy as PNG with the keyboard', async ({ page }) => {
  await openIcon(page);
  await page.evaluate(() => window.__appIconic!.run('file.exportIco', { targetDir: '/again' }));
  await expect.poll(() => exported(page)).toEqual(['/again/camscanner.ico']);
  await menu(page, 'File', 'Export Again');
  // the file is there from the first export → question
  const ask = page.getByRole('alertdialog', { name: 'Export Again' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Replace' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__appIconic!.exporter.calls.map((c) => c.options.overwrite)),
    )
    .toEqual([false, false, true]);
  await page
    .locator('body')
    .click({ position: { x: 5, y: 5 } })
    .catch(() => undefined);
  await page.keyboard.press('Control+Shift+C');
  await expect
    .poll(() => page.evaluate(() => window.__appIconic!.exporter.clipboard.map((c) => c.size)))
    .toEqual([1024]);
});
