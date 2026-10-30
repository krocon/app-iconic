import { expect, Page, test } from '@playwright/test';
import { collectErrors, docPixel, importSvg, setView, toClient } from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 080 – images as layers (Chromium, browser mode with fakes): "Import Image as Layer…"
 * makes a PNG layer in the active group, dragging inside the selected layer's frame and its corner
 * handles writes `position` (one undo step each), the export SVG carries the image, "Replace
 * Layer Image…" keeps the position; a JPEG is converted to a PNG asset by the browser.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const near = (a: number[], b: number[], tolerance = 12) =>
  b.every((v, i) => Math.abs(a[i] - v) <= tolerance);

/** A solid image of `w × h` as data URL, drawn by the page's canvas. */
function solidImage(page: Page, color: string, w: number, h: number, mime = 'image/png') {
  return page.evaluate(
    ([color, w, h, mime]) => {
      const c = document.createElement('canvas');
      c.width = Number(w);
      c.height = Number(h);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = String(color);
      ctx.fillRect(0, 0, c.width, c.height);
      return c.toDataURL(String(mime));
    },
    [color, w, h, mime],
  );
}

async function addImage(
  page: Page,
  path: string,
  name: string,
  dataUrl: string,
  w: number,
  h: number,
) {
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
  await page.evaluate(
    ([path, name, mime, dataUrl, w, h]) => {
      const hook = window.__appIconic!;
      hook.addImageFile(String(path), {
        name: String(name),
        mime: String(mime),
        dataUrl: String(dataUrl),
        width: Number(w),
        height: Number(h),
      });
      hook.pick(String(path));
    },
    [path, name, mime, dataUrl, w, h],
  );
}

async function setup(page: Page): Promise<string> {
  await page.goto('/');
  await expect(page).toHaveTitle('Untitled');
  await page.evaluate(() => {
    const c = window.__appIconic!.canvas;
    c.set('guides', false);
    c.set('effects', false);
    c.set('mask', 'none');
    c.set('appearance', 'light');
    c.set('snapToGrid', false);
    c.set('magicSnap', false);
    c.set('crossCursor', false);
  });
  await setView(page, 0.5, 20, 20);
  const red = await solidImage(page, '#ff0000', 200, 100);
  await addImage(page, '/img/red.png', 'red.png', red, 200, 100);
  await menu(page, 'File', 'Import Image as Layer…');
  await expect(page.getByRole('tree')).toContainText('red');
  return red;
}

/** `position` of the first layer of the first group. */
const position = (page: Page) =>
  page.evaluate(
    () =>
      window.__appIconic!.store()!.document().iconJson.groups![0].layers![0]['position'] ?? null,
  );

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await toClient(page, from.x, from.y);
  const b = await toClient(page, to.x, to.y);
  await page.mouse.move(a.clientX, a.clientY);
  await page.mouse.down();
  await page.mouse.move((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, { steps: 4 });
  await page.mouse.move(b.clientX, b.clientY, { steps: 4 });
  await page.mouse.up();
}

test('import a PNG as layer, move it on the canvas, undo, export', async ({ page }) => {
  const errors = collectErrors(page);
  const red = await setup(page);
  const state = await page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    const d = s.document();
    return {
      items: s.items(),
      layer: d.iconJson.groups![0].layers![0],
      asset: d.asset('red.png')?.dataUrl?.slice(0, 22),
    };
  });
  expect(state.items).toEqual([{ kind: 'layer', group: 0, layer: 0 }]);
  expect(state.layer).toEqual({ 'image-name': 'red.png', name: 'red' });
  expect(state.asset).toBe('data:image/png;base64,');
  // natural size, centred: 412…612 × 462…562
  expect(near(await docPixel(page, 512, 512), [255, 0, 0])).toBe(true);
  expect(near(await docPixel(page, 400, 512), [255, 0, 0])).toBe(false);
  // the frame and four handles on the image's corners
  const handles = page.locator('[data-testid="layer-handles"] [data-layer-handle]');
  await expect(handles).toHaveCount(4);
  const br = await handles.nth(2).boundingBox();
  const corner = await toClient(page, 612, 562);
  expect(Math.abs(br!.x + br!.width / 2 - corner.clientX)).toBeLessThan(1.5);
  expect(Math.abs(br!.y + br!.height / 2 - corner.clientY)).toBeLessThan(1.5);

  // drag inside the frame: 100 right, 60 down (zoom 0.5 → whole pixels)
  await drag(page, { x: 500, y: 500 }, { x: 600, y: 560 });
  await expect.poll(() => position(page)).toEqual({ scale: 1, 'translation-in-points': [100, 60] });
  await expect.poll(() => docPixel(page, 690, 600)).toEqual([255, 0, 0, 255]);
  const undo = await page.evaluate(() => window.__appIconic!.store()!.undoLabel());
  expect(undo).toContain('Move Layer');
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await expect.poll(() => position(page)).toBeNull();

  // a corner handle scales about the centre: corner 612,562 → 712,612 = twice as far
  await drag(page, { x: 612, y: 562 }, { x: 712, y: 612 });
  await expect.poll(() => position(page)).toEqual({ scale: 2, 'translation-in-points': [0, 0] });
  expect(near(await docPixel(page, 330, 430), [255, 0, 0])).toBe(true);

  // export SVG: the image with the layer's position
  await page.evaluate(() =>
    window.__appIconic!.run('file.exportSvg', { appearances: ['light'], targetDir: '/e' }),
  );
  await expect
    .poll(() => page.evaluate(() => [...window.__appIconic!.exporter.files.keys()]))
    .toEqual(['/e/Untitled-light.svg']);
  const svg = await page.evaluate(() =>
    window.__appIconic!.exporter.files.get('/e/Untitled-light.svg')!,
  );
  expect(svg).toContain(`href="${red}"`);
  expect(svg).toContain('<image x="412" y="462" width="200" height="100"');
  expect(svg).toContain('translate(512 512) scale(2) translate(-512 -512)');
  expect(errors).toEqual([]);
});

test('replace the image keeps the position; a JPEG becomes a PNG asset', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.evaluate(() =>
    window.__appIconic!.run('icon.set', {
      group: 0,
      layer: 0,
      field: 'position.x',
      value: -200,
    }),
  );
  await expect.poll(() => position(page)).toEqual({ scale: 1, 'translation-in-points': [-200, 0] });
  const blue = await solidImage(page, '#0000ff', 200, 100);
  await addImage(page, '/img/blue.png', 'blue.png', blue, 200, 100);
  await page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    s.selectItems([{ kind: 'layer', group: 0, layer: 0 }]);
    window.__appIconic!.run('file.replaceLayerImage');
  });
  await expect
    .poll(() =>
      page.evaluate(() => window.__appIconic!.store()!.document().asset('red.png')!.dataUrl),
    )
    .toBe(blue);
  expect(await position(page)).toEqual({ scale: 1, 'translation-in-points': [-200, 0] });
  await expect.poll(() => docPixel(page, 312, 512)).toEqual([0, 0, 255, 255]);

  // JPEG → PNG (converted by the browser), as a new layer in front
  const jpeg = await solidImage(page, '#00ff00', 64, 32, 'image/jpeg');
  await addImage(page, '/img/photo.jpg', 'photo.jpg', jpeg, 64, 32);
  await page.evaluate(() => window.__appIconic!.run('file.importImageLayer'));
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__appIconic!.store()!.document().asset('photo.png')?.dataUrl?.slice(0, 22),
      ),
    )
    .toBe('data:image/png;base64,');
  expect(
    await page.evaluate(
      () => window.__appIconic!.store()!.document().iconJson.groups![0].layers![0]['name'],
    ),
  ).toBe('photo');
  expect(near(await docPixel(page, 512, 512), [0, 255, 0], 20)).toBe(true);
  expect(errors).toEqual([]);
});

test('an SVG layer moves too; Esc cancels a drag', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Untitled');
  await page.evaluate(() => {
    const c = window.__appIconic!.canvas;
    c.set('snapToGrid', false);
    c.set('magicSnap', false);
  });
  await importSvg(
    page,
    'dot.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
      '<circle cx="300" cy="300" r="50" fill="#0f0"/></svg>',
  );
  await setView(page, 0.5, 20, 20);
  await page.evaluate(() =>
    window.__appIconic!.store()!.selectItems([{ kind: 'layer', group: 0, layer: 0 }]),
  );
  // the frame is the content (the circle), not the 1024 placement
  const handles = page.locator('[data-testid="layer-handles"] [data-layer-handle]');
  await expect(handles).toHaveCount(4);
  const tl = await handles.nth(0).boundingBox();
  const expected = await toClient(page, 250, 250);
  expect(Math.abs(tl!.x + tl!.width / 2 - expected.clientX)).toBeLessThan(1.5);
  // a press on empty space inside the frame (not on the circle) moves the layer
  await drag(page, { x: 263, y: 263 }, { x: 363, y: 263 });
  await expect.poll(() => position(page)).toEqual({ scale: 1, 'translation-in-points': [100, 0] });
  // Esc during a drag: back to where it was
  const a = await toClient(page, 380, 300);
  await page.mouse.move(a.clientX, a.clientY);
  await page.mouse.down();
  await page.mouse.move(a.clientX + 40, a.clientY + 40, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(() => position(page)).toEqual({ scale: 1, 'translation-in-points': [100, 0] });
});

test('a moved layer snaps its centre to the canvas centre (Magic Snap, like 007)', async ({
  page,
}) => {
  await setup(page);
  await drag(page, { x: 500, y: 500 }, { x: 600, y: 500 });
  await expect.poll(() => position(page)).toEqual({ scale: 1, 'translation-in-points': [100, 0] });
  await page.evaluate(() => window.__appIconic!.canvas.set('magicSnap', true));
  // back by 96: the centre lands 4 units right of the canvas centre and snaps onto it
  await drag(page, { x: 600, y: 500 }, { x: 504, y: 500 });
  await expect.poll(() => position(page)).toEqual({ scale: 1, 'translation-in-points': [0, 0] });
});
