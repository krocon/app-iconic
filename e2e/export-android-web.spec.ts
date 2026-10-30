import { expect, Page, test } from '@playwright/test';
import { collectErrors, openIcon } from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 079 – Android and web packages (Chromium, browser mode with the fake export backend):
 * the dialog with layers per group and the texts to copy; `favicon.svg` painted by the browser
 * in light and dark (`prefers-color-scheme`); the maskable icon keeps everything but the fill
 * inside the safe zone; the Android foreground keeps the 18 dp margin free.
 */
test.use({ viewport: { width: 1440, height: 1000 } });

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Export' });
const exported = (page: Page) =>
  page.evaluate(() => [...window.__appIconic!.exporter.files.keys()]);
const source = (page: Page, id: string) =>
  page.evaluate(
    (id) => window.__appIconic!.exporter.packages.at(-1)!.sources.find((s) => s.id === id)!.svg,
    id,
  );

/** Pixels `[r, g, b, a]` of `svg` drawn at `size` px, at the given points. */
function pixels(page: Page, svg: string, size: number, points: [number, number][]) {
  return page.evaluate(
    async ({ svg, size, points }) => {
      const img = new Image();
      img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0, size, size);
      return points.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data]);
    },
    { svg, size, points },
  );
}

test('File › Export Android Icons…: layers per group, monochrome, android/ folder', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openIcon(page);
  await menu(page, 'File', 'Export Android Icons…');
  const d = dialog(page);
  await expect(d.getByTestId('export-format-android')).toBeChecked();
  await expect(d.getByTestId('export-format-hint')).toContainText('72 dp');
  await expect(d.getByTestId('export-mask')).toHaveCount(0);
  await expect(d.getByTestId('export-monochrome')).toBeChecked();
  await expect(d).toContainText('28 files');
  await d.getByTestId('export-layer-1').selectOption('background');
  await d.getByTestId('export-choose').click();
  await d.getByTestId('export-run').click();
  await expect(d.getByTestId('export-result')).toHaveText('Exported 28 files.');
  const files = await exported(page);
  expect(files[0]).toBe('/export/android');
  expect(files).toContain('/export/android/res/mipmap-anydpi-v26/ic_launcher.xml');
  expect(files).toContain('/export/android/res/mipmap-xxxhdpi/ic_launcher_monochrome.png');
  expect(files).toContain('/export/android/ic_launcher-playstore.png');
  // the foreground leaves the outer 18 dp of 108 free (canvas = 72 dp viewport)
  const fg = await source(page, 'android-foreground');
  const outer = await pixels(page, fg, 108, [
    [8, 54],
    [54, 8],
    [100, 54],
    [54, 100],
  ]);
  expect(outer.map((p) => p[3])).toEqual([0, 0, 0, 0]);
  // the group moved to the background is not in front any more
  expect(fg.match(/class="ai-export-group"/g)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('Web: snippet and manifest copied; favicon.svg light and dark; maskable safe zone', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openIcon(page);
  await menu(page, 'File', 'Export Web Icons…');
  const d = dialog(page);
  await expect(d.getByTestId('export-format-web')).toBeChecked();
  await expect(d.getByTestId('export-text-snippet')).toContainText('rel="apple-touch-icon"');
  await d.getByRole('button', { name: 'Copy HTML for <head>' }).click();
  await expect(d.getByTestId('export-copied')).toHaveText('Copied to the clipboard.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  );
  await d.getByTestId('export-copy-manifest').click();
  expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).icons).toHaveLength(
    3,
  );
  await d.getByTestId('export-mask').selectOption('squircle');
  await d.getByTestId('export-choose').click();
  await d.getByTestId('export-run').click();
  await expect(d.getByTestId('export-result')).toHaveText('Exported 8 files.');
  expect(await exported(page)).toContain('/export/web/favicon.svg');

  // favicon.svg follows the colour scheme (emulated like the system setting)
  const favicon = await source(page, 'web-favicon');
  const spot: [number, number][] = [[300, 300]]; // background inside the squircle, beside the glyph
  await page.emulateMedia({ colorScheme: 'light' });
  const [light] = await pixels(page, favicon, 1024, spot);
  await page.emulateMedia({ colorScheme: 'dark' });
  const [dark] = await pixels(page, favicon, 1024, spot);
  const luma = (p: number[]) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  expect(light[3]).toBe(255);
  expect(dark[3]).toBe(255);
  // light system background (a light gradient) vs. the dark one
  expect(luma(light)).toBeGreaterThan(150);
  expect(luma(dark)).toBeLessThan(100);

  // maskable: outside the safe zone (radius 40 % = 204.8 of 512) only the fill – the same
  // pixels as the icon without its groups
  const maskable = await source(page, 'web-maskable');
  const fillOnly = await page.evaluate((svg) => {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    for (const g of Array.from(doc.querySelectorAll('.ai-export-group'))) g.remove();
    return new XMLSerializer().serializeToString(doc);
  }, maskable);
  const outside: [number, number][] = [
    [256, 20],
    [20, 256],
    [492, 256],
    [256, 492],
    [5, 5],
    [506, 506],
    [60, 60],
  ];
  const withGroups = await pixels(page, maskable, 512, outside);
  expect(withGroups).toEqual(await pixels(page, fillOnly, 512, outside));
  expect(withGroups.every((p) => p[3] === 255)).toBe(true);
  // … and the groups are there inside it
  const centre: [number, number][] = [[256, 256]];
  expect(await pixels(page, maskable, 512, centre)).not.toEqual(
    await pixels(page, fillOnly, 512, centre),
  );
});
