import { expect, Page, test } from '@playwright/test';
import { collectErrors, setView, toClient } from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 087 – trace an image (Chromium, browser mode with fakes; the real tracing is Rust's and
 * tested there): an image file becomes the template – fitted into the canvas, over the layers,
 * never hit by the pointer –, "Trace Image…" previews it in the dialog and inserts the result as
 * a new SVG layer in one undo step.
 */
test.use({ viewport: { width: 1440, height: 900 } });

async function setup(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle('Untitled');
  await page.evaluate(() => {
    const c = window.__appIconic!.canvas;
    c.set('guides', false);
    c.set('mask', 'none');
    c.set('crossCursor', false);
  });
  await setView(page, 0.5, 20, 20);
  // a 300 × 150 picture: red left, blue right
  const url = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 150;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 150, 150);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(150, 0, 150, 150);
    return c.toDataURL('image/png');
  });
  await page.evaluate((url) => {
    const hook = window.__appIconic!;
    hook.addImageFile('/pics/flag.png', {
      name: 'flag.png',
      mime: 'image/png',
      dataUrl: url,
      width: 300,
      height: 150,
    });
    hook.pick('/pics/flag.png');
  }, url);
}

test('an image as template: fitted into the canvas, over the layers, not in the way', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('template.fromFile'));
  const img = page.getByTestId('canvas-template');
  await expect(img).toBeVisible();
  // 300 × 150 fitted: 1024 × 512, centred → (0, 256)–(1024, 768) in icon units
  const box = (await img.boundingBox())!;
  const tl = await toClient(page, 0, 256);
  const br = await toClient(page, 1024, 768);
  expect(Math.abs(box.x - tl.clientX)).toBeLessThan(1.5);
  expect(Math.abs(box.y - tl.clientY)).toBeLessThan(1.5);
  expect(Math.abs(box.x + box.width - br.clientX)).toBeLessThan(1.5);
  expect(Math.abs(box.y + box.height - br.clientY)).toBeLessThan(1.5);
  expect(await img.evaluate((e) => getComputedStyle(e).opacity)).toBe('0.5');
  expect(await img.evaluate((e) => getComputedStyle(e.parentElement!).pointerEvents)).toBe('none');
  // the template is no part of the document
  expect(await page.evaluate(() => window.__appIconic!.store()!.dirty())).toBe(false);
  // hide, opacity, remove
  await page.evaluate(() => window.__appIconic!.run('template.toggle'));
  await expect(img).toBeHidden();
  await page.evaluate(() => {
    window.__appIconic!.run('template.toggle');
    window.__appIconic!.run('template.opacity', { value: 0.8 });
  });
  await expect(img).toHaveCSS('opacity', '0.8');
  await page.evaluate(() => window.__appIconic!.run('template.clear'));
  await expect(img).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Trace Image… previews the template and inserts a new layer in one undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('template.fromFile'));
  await menu(page, 'File', 'Trace Image…');
  const dialog = page.getByRole('dialog', { name: 'Trace Image' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('trace-source-name')).toHaveText('flag.png · 300 × 150 px');
  await expect(dialog.getByTestId('trace-stats')).toContainText('elements');
  await expect(dialog.getByTestId('trace-preview').locator('img')).toBeVisible();
  // another style traces again
  await dialog.getByTestId('trace-preset-detail').check();
  await expect(dialog.getByTestId('trace-stats')).toContainText('0 rectangles');
  await dialog.getByTestId('trace-preset-shapes').check();
  await expect(dialog.getByTestId('trace-stats')).toContainText('1 rectangles');
  await dialog.getByTestId('trace-insert').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('tree')).toContainText('flag-traced');
  const doc = await page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    return {
      layer: s.document().iconJson.groups![0].layers![0],
      svg: window.__appIconic!.assetText('flag-traced.svg'),
      undo: s.undoLabel(),
    };
  });
  expect(doc.layer).toEqual({ 'image-name': 'flag-traced.svg', name: 'flag-traced' });
  // fitted like the template: 1024 × 512
  expect(doc.svg).toContain('width="1024"');
  expect(doc.svg).toContain('height="512"');
  expect(doc.undo).toBe('Undo Trace Image');
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('tree')).not.toContainText('flag-traced');
  expect(errors).toEqual([]);
});
