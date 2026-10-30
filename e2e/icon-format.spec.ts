import { expect, Page, test } from '@playwright/test';
import { collectErrors, docPixel, importSvg, setView } from './canvas-helpers';

/**
 * Prompt 077 – the `.icon` format shown completely (Chromium, browser mode): a layer fill colours
 * a single-colour layer on the canvas and in the export SVG; the tinted appearance (approximation:
 * luminance × tint) from the canvas toolbar.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const CIRCLE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<circle cx="512" cy="512" r="300" fill="#0000ff"/></svg>';

const near = (a: number[], b: number[], tolerance = 10) =>
  b.every((v, i) => Math.abs(a[i] - v) <= tolerance);

async function setup(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveTitle('Untitled');
  await page.evaluate(() => {
    const c = window.__appIconic!.canvas;
    c.set('guides', false);
    c.set('effects', false);
    c.set('mask', 'none');
    c.set('appearance', 'light');
  });
  await importSvg(page, 'circle.svg', CIRCLE);
  await setView(page, 0.5, 20, 20);
}

/** The exported SVG painted in the page, one pixel. */
async function exportPixel(page: Page, path: string, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    async ([path, x, y]) => {
      const svg = window.__appIconic!.exporter.files.get(path as string)!;
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 1024;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, 1024, 1024);
      return [...ctx.getImageData(x as number, y as number, 1, 1).data];
    },
    [path, x, y],
  );
}

test('a red layer fill colours a blue layer on the canvas and in the export SVG', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  expect(near(await docPixel(page, 512, 512), [0, 0, 255])).toBe(true);
  const ok = await page.evaluate(() =>
    window.__appIconic!.run('icon.set', {
      group: 0,
      layer: 0,
      field: 'fill',
      value: { solid: 'srgb:1.00000,0.00000,0.00000,1.00000' },
    }),
  );
  expect(ok).toBe(true);
  await expect.poll(() => docPixel(page, 512, 512)).toEqual([255, 0, 0, 255]);
  // outside the shape: the background, not the fill
  expect(near(await docPixel(page, 100, 100), [255, 255, 255], 30)).toBe(true);
  await page.evaluate(() =>
    window.__appIconic!.run('file.exportSvg', { appearances: ['light'], targetDir: '/f' }),
  );
  await expect
    .poll(() => page.evaluate(() => [...window.__appIconic!.exporter.files.keys()]))
    .toEqual(['/f/Untitled-light.svg']);
  const svg = await page.evaluate(() =>
    window.__appIconic!.exporter.files.get('/f/Untitled-light.svg')!,
  );
  expect(svg).toMatch(/<g mask="url\(#ai-export-layer-fill-\d+-mask\)"><rect [^>]*fill="#ff0000"/);
  expect(svg).toContain('mask-type="alpha"');
  expect(near(await exportPixel(page, '/f/Untitled-light.svg', 512, 512), [255, 0, 0])).toBe(true);
  expect(
    near(await exportPixel(page, '/f/Untitled-light.svg', 100, 100), [255, 255, 255], 30),
  ).toBe(true);
  // Undo: the natural colour again
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await expect.poll(async () => near(await docPixel(page, 512, 512), [0, 0, 255])).toBe(true);
  expect(errors).toEqual([]);
});

test('switching to Tinted: luminance × tint on the canvas, the tint from the toolbar', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  const tinted = page
    .getByTestId('segment-appearance')
    .locator('[data-action="view.appearance.tinted"]');
  await tinted.click();
  await expect(tinted).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('canvas-paper')).toHaveClass(/tinted/);
  await expect(page.getByTestId('canvas-tint')).toBeVisible();
  // blue: luminance 0.0722 → dark grey with the white default tint
  await expect.poll(async () => near(await docPixel(page, 512, 512), [18, 18, 18], 6)).toBe(true);
  // white tint → grey; a red tint keeps only the red channel
  await page.evaluate(() => window.__appIconic!.run('view.tint', { color: '#ff0000' }));
  await expect
    .poll(async () => {
      const p = await docPixel(page, 512, 512);
      return p[1] === 0 && p[2] === 0 && p[0] > 10;
    })
    .toBe(true);
  // the inspector follows (Tinted is one appearance now)
  await page.evaluate(() => window.__appIconic!.run('view.appearance.light'));
  await expect(page.getByTestId('canvas-paper')).not.toHaveClass(/tinted/);
  expect(near(await docPixel(page, 512, 512), [0, 0, 255])).toBe(true);
  // export of the tinted variant with the canvas tint
  await page.evaluate(() =>
    window.__appIconic!.run('file.exportSvg', { appearances: ['tinted'], targetDir: '/t' }),
  );
  await expect
    .poll(() => page.evaluate(() => [...window.__appIconic!.exporter.files.keys()]))
    .toEqual(['/t/Untitled-tinted.svg']);
  const p = await exportPixel(page, '/t/Untitled-tinted.svg', 512, 512);
  expect(p[1]).toBe(0);
  expect(p[2]).toBe(0);
  expect(errors).toEqual([]);
});
