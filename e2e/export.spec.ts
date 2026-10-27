import { expect, Page, test } from '@playwright/test';
import {
  collectErrors,
  docPixel,
  gradientSvg,
  importSvg,
  openIcon,
  setView,
} from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 012 – export (Chromium, browser mode with the fake export backend): the dialog from the
 * menu with folder, sizes, progress, result and the overwrite question; the exported SVG paints
 * like the canvas; the export actions with arguments (AI).
 */
test.use({ viewport: { width: 1440, height: 900 } });

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Export' });
const exported = (page: Page) =>
  page.evaluate(() => [...window.__appIconic!.exporter.files.keys()]);

test('File › Export PNG…: folder, sizes, progress, result, overwrite question', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openIcon(page);
  await menu(page, 'File', 'Export PNG…');
  const d = dialog(page);
  await expect(d).toBeVisible();
  await expect(d.getByTestId('export-format-png')).toBeChecked();
  await expect(d.getByTestId('export-run')).toBeDisabled();
  await d.getByTestId('export-choose').click();
  await expect(d.getByTestId('export-target')).toHaveText('/export');
  await d.getByTestId('export-size-512').check();
  await d.getByTestId('export-size-16').check();
  await d.getByTestId('export-appearance-dark').uncheck();
  await expect(d).toContainText('3 files');
  await d.getByTestId('export-run').click();
  await expect(d.getByTestId('export-result')).toHaveText('Exported 3 files.');
  expect(await exported(page)).toEqual([
    '/export/camscanner-light-1024.png',
    '/export/camscanner-light-512.png',
    '/export/camscanner-light-16.png',
  ]);
  // the same again: the files exist → question, nothing replaced until "Replace"
  await d.getByTestId('export-run').click();
  await expect(d.getByTestId('export-exists')).toBeVisible();
  await d.getByTestId('export-replace').click();
  await expect(d.getByTestId('export-result')).toHaveText('Exported 3 files.');
  const calls = await page.evaluate(() =>
    window.__appIconic!.exporter.calls.map((c) => c.options.overwrite),
  );
  expect(calls).toEqual([false, false, true]);
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  // the choice is remembered for the next export in this session
  await menu(page, 'File', 'Export SVG…');
  await expect(d.getByTestId('export-format-svg')).toBeChecked();
  await expect(d.getByTestId('export-target')).toHaveText('/export');
  await expect(d.getByTestId('export-appearance-dark')).not.toBeChecked();
  expect(errors).toEqual([]);
});

test('Stop while PNGs render; the Apple hint for transparent PNGs', async ({ page }) => {
  await openIcon(page);
  await page.evaluate(() => {
    const ex = window.__appIconic!.exporter;
    ex.transparentNames.add('camscanner-dark-1024.png');
    let release!: () => void;
    ex.hold = new Promise<void>((r) => (release = r));
    (window as unknown as { release: () => void }).release = release;
  });
  await menu(page, 'File', 'Export PNG…');
  const d = dialog(page);
  await d.getByTestId('export-choose').click();
  await d.getByTestId('export-run').click();
  await expect(d.getByTestId('export-progress')).toBeVisible();
  await d.getByTestId('export-stop').click();
  await page.evaluate(() => (window as unknown as { release: () => void }).release());
  await expect(d.getByTestId('export-result')).toHaveText('Export stopped after 0 files.');
  await page.evaluate(() => (window.__appIconic!.exporter.hold = null));
  await d.getByTestId('export-run').click();
  await expect(d.getByTestId('export-result')).toHaveText('Exported 2 files.');
  await expect(d.getByTestId('export-warning')).toContainText('without transparency');
});

test('the exported SVG paints like the canvas (ids per layer, opacity, no effects)', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__appIconic!.canvas.set('mask', 'none');
    window.__appIconic!.canvas.set('effects', false);
    window.__appIconic!.canvas.set('guides', false);
  });
  // two assets with the same gradient id (design 012 E2) and a half transparent layer
  await importSvg(page, 'blue.svg', gradientSvg('#0000ff', 0, 1024));
  await importSvg(page, 'red.svg', gradientSvg('#ff0000', 0, 600));
  await page.evaluate(() =>
    window.__appIconic!.runCommand({
      type: 'setIconJsonValue',
      path: ['groups', 0, 'layers', 0, 'opacity'],
      value: 0.5,
    }),
  );
  await setView(page, 0.5, 20, 20);
  await page.evaluate(() =>
    window.__appIconic!.run('file.exportSvg', { appearances: ['light'], targetDir: '/cmp' }),
  );
  await expect.poll(() => exported(page)).toEqual(['/cmp/Untitled-light.svg']);
  const points: [number, number][] = [
    [300, 500],
    [900, 500],
    [20, 20],
  ];
  const fromExport = await page.evaluate(async (pts) => {
    const svg = window.__appIconic!.exporter.files.get('/cmp/Untitled-light.svg')!;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 1024, 1024);
    return pts.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
  }, points);
  for (let i = 0; i < points.length; i++) {
    const onCanvas = await docPixel(page, ...points[i]);
    for (let ch = 0; ch < 3; ch++) {
      expect(Math.abs(onCanvas[ch] - fromExport[i][ch]), `${points[i]} channel ${ch}`).toBeLessThan(
        8,
      );
    }
  }
  // red half over blue on the left: purple, right only blue
  expect(fromExport[0][0]).toBeGreaterThan(100);
  expect(fromExport[0][2]).toBeGreaterThan(100);
  expect(fromExport[1][0]).toBeLessThan(30);
});

test('export actions with arguments (AI): straight to the files, result as notice', async ({
  page,
}) => {
  await openIcon(page);
  await page.evaluate(() =>
    window.__appIconic!.run('file.exportPng', {
      sizes: [64, 32],
      appearances: ['dark'],
      mask: 'squircle',
      targetDir: '/ai',
    }),
  );
  await expect(page.getByRole('status')).toContainText('Exported 2 files.');
  expect(await exported(page)).toEqual([
    '/ai/camscanner-dark-64.png',
    '/ai/camscanner-dark-32.png',
  ]);
  const svg = await page.evaluate(() => window.__appIconic!.exporter.calls[0].variants[0].svg);
  expect(svg).toContain('clip-path="url(#ai-export-mask)"');
  expect(svg).not.toContain('data-ai-');
  // again without overwrite → nothing replaced, notice
  await page.evaluate(() =>
    window.__appIconic!.run('file.exportPng', {
      sizes: [64],
      appearances: ['dark'],
      targetDir: '/ai',
    }),
  );
  await expect(page.getByRole('status')).toContainText('already exist');
  const ok = await page.evaluate(() => window.__appIconic!.run('file.exportPng', { mask: 'star' }));
  expect(ok).toBe(false);
});
