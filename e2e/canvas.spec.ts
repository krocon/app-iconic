import { expect, test } from '@playwright/test';
import {
  collectErrors,
  docPixel,
  gradientSvg,
  importSvg,
  openIcon,
  setView,
  SVG_FIXTURE_NAMES,
  toClient,
  waitForCanvas,
} from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 004 – the canvas with real layout (Chromium). No pixel baselines (design 004 E16): DOM,
 * geometry and single pixel colours only.
 */
test.use({ viewport: { width: 1440, height: 900 } });

for (const name of SVG_FIXTURE_NAMES) {
  test(`renders ${name} live and without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await openIcon(page, `/fixtures/svg/${name.replace('.svg', '')}.icon`);
    const info = await page.evaluate((asset) => {
      const hook = window.__appIconic!;
      const root = hook.store()!.document().assets.get(asset)!.svg!.root as SVGSVGElement;
      const layer = document.querySelector(`app-canvas-view .layer[data-asset="${asset}"]`)!;
      const box = root.getBoundingClientRect();
      return {
        live: layer.shadowRoot!.contains(root),
        width: box.width,
        height: box.height,
        drawn: root.querySelectorAll('path, rect, circle, polygon, text, ellipse, line').length,
      };
    }, name);
    expect(info.live).toBe(true);
    expect(info.width).toBeGreaterThan(0);
    expect(info.height).toBeGreaterThan(0);
    expect(info.drawn).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test('an asset of another size sits centred and unscaled (some_pathes.svg 500 × 500)', async ({
  page,
}) => {
  await openIcon(page, '/fixtures/svg/some_pathes.icon');
  await setView(page, 1, 10, 10);
  const r = await page.evaluate(() => {
    const hook = window.__appIconic!;
    const root = hook.store()!.document().assets.get('some_pathes.svg')!.svg!.root;
    return hook.nodeBounds('some_pathes.svg', root.getAttribute('data-ai-id')!);
  });
  // the root's bbox is its content; its viewport is what matters: check via the placement
  expect(r).not.toBeNull();
  const place = await page.evaluate(() => {
    const layer = document.querySelector('app-canvas-view .layer')!;
    const p = layer.shadowRoot!.querySelector('svg.placement')!;
    return ['x', 'y', 'width', 'height'].map((a) => p.getAttribute(a));
  });
  expect(place).toEqual(['262', '262', '500', '500']);
});

for (const zoom of [0.5, 1, 1.5]) {
  test(`clientToDocument is exact at ${zoom * 100} % and after a pan`, async ({ page }) => {
    await openIcon(page, '/fixtures/svg/nested_g.icon');
    for (const [panX, panY] of [
      [20, 30],
      [-137.25, 61.5],
    ]) {
      await setView(page, zoom, panX, panY);
      // the full-size black rect of nested_g.svg is laid out by the browser – independent of our math
      const rect = await page
        .locator('app-canvas-view .layer svg[data-ai-id] > rect')
        .first()
        .boundingBox();
      expect(rect!.width).toBeCloseTo(1024 * zoom, 0);
      for (const [x, y] of [
        [0, 0],
        [512, 512],
        [100.5, 900.25],
        [1024, 1024],
      ]) {
        const client = { x: rect!.x + x * zoom, y: rect!.y + y * zoom };
        const d = await page.evaluate(
          ([cx, cy]) => window.__appIconic!.clientToDocument(cx, cy),
          [client.x, client.y],
        );
        expect(Math.abs(d!.x - x)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(d!.y - y)).toBeLessThanOrEqual(0.5);
      }
    }
  });
}

test('the status line shows the pointer position in document units', async ({ page }) => {
  await openIcon(page);
  await setView(page, 0.5, 16, 24);
  const c = await toClient(page, 256, 768);
  await page.mouse.move(c.clientX, c.clientY);
  await expect(page.getByTestId('canvas-coords')).toHaveText(/X 256\.0\s+Y 768\.0/);
  await page.mouse.move(5, 5);
  await expect(page.getByTestId('canvas-coords')).toHaveText(/X –\s+Y –/);
});

test('Ctrl+wheel zooms around the pointer; the point under it stays put', async ({ page }) => {
  await openIcon(page, '/fixtures/svg/logo-artv.icon');
  const vp = (await page.locator('app-canvas-view .viewport').boundingBox())!;
  // whole pixels: Chromium reports wheel positions as integers
  const at = { x: Math.round(vp.x + vp.width * 0.3), y: Math.round(vp.y + vp.height * 0.6) };
  await page.mouse.move(at.x, at.y);
  const before = await page.evaluate(
    ([x, y]) => window.__appIconic!.clientToDocument(x, y),
    [at.x, at.y],
  );
  const zoom0 = await page.evaluate(() => window.__appIconic!.canvas.zoom());
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect
    .poll(() => page.evaluate(() => window.__appIconic!.canvas.zoom()))
    .toBeGreaterThan(zoom0);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  const after = await page.evaluate(
    ([x, y]) => window.__appIconic!.clientToDocument(x, y),
    [at.x, at.y],
  );
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(0.5);
});

test('nested_g.svg: getCTM-based origins of nested transformed groups match their labels', async ({
  page,
}) => {
  await openIcon(page, '/fixtures/svg/nested_g.icon');
  for (const [zoom, panX, panY] of [
    [0.5, 30, 40],
    [1, -100, 12],
    [1.5, -400, -300],
  ]) {
    await setView(page, zoom, panX, panY);
    const rows = await page.evaluate(() => {
      const hook = window.__appIconic!;
      const root = hook.store()!.document().assets.get('nested_g.svg')!.svg!.root;
      return [...root.querySelectorAll('g')].flatMap((g) => {
        const label = g.querySelector(':scope > text')?.textContent ?? '';
        const m = /Pos \(([-\d.]+),([-\d.]+)\)/.exec(label);
        const ctm = hook.nodeToDocument('nested_g.svg', g.getAttribute('data-ai-id')!);
        return m && ctm ? [{ label, want: [+m[1], +m[2]], got: [ctm[4], ctm[5]] }] : [];
      });
    });
    expect(rows.length).toBeGreaterThanOrEqual(20);
    for (const r of rows) {
      expect(Math.abs(r.got[0] - r.want[0]), r.label).toBeLessThanOrEqual(0.5);
      expect(Math.abs(r.got[1] - r.want[1]), r.label).toBeLessThanOrEqual(0.5);
    }
  }
});

test('first group on top, and equal ids in two assets resolve per layer', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.evaluate(() => window.__appIconic!.canvas.set('mask', 'none'));
  // plain colours: without the effects approximation (shadow, translucency – design 010 E13)
  await page.evaluate(() => window.__appIconic!.canvas.set('effects', false));
  // both assets define <linearGradient id="g">; red covers the left 600, blue all of it
  await importSvg(page, 'blue.svg', gradientSvg('#0000ff', 0, 1024));
  await importSvg(page, 'red.svg', gradientSvg('#ff0000', 0, 600));
  await setView(page, 0.5, 20, 20);
  // red was imported last → first group (imports go on top, design 006 E14) → over blue
  const [r1, g1, b1] = await docPixel(page, 300, 500);
  expect([r1 > 200, g1 < 60, b1 < 60]).toEqual([true, true, true]);
  // right side: only blue – its url(#g) must not resolve to red's gradient
  const [r2, g2, b2] = await docPixel(page, 900, 500);
  expect([r2 < 60, g2 < 60, b2 > 200]).toEqual([true, true, true]);
});

test('group containers fill the canvas – the translucency mask has a box (WebKit fix)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForCanvas(page);
  await page.evaluate(() => window.__appIconic!.run('add.circle'));
  const boxes = await page.evaluate(() => {
    const layers = document.querySelector('app-canvas-view .layers')!.getBoundingClientRect();
    const group = document.querySelector<HTMLElement>('app-canvas-view .group')!;
    const g = group.getBoundingClientRect();
    return {
      lw: layers.width,
      lh: layers.height,
      gw: g.width,
      gh: g.height,
      t: group.dataset['translucency'],
    };
  });
  expect(boxes.t).toBe('0.5');
  expect(boxes.gh).toBeCloseTo(boxes.lh, 0);
  expect(boxes.gw).toBeCloseTo(boxes.lw, 0);
});

test('platform mask cuts the corners; background and appearance switch', async ({ page }) => {
  await openIcon(page);
  await page.evaluate(() => {
    const c = window.__appIconic!.canvas;
    c.set('appearance', 'light');
    c.set('mask', 'none');
    c.set('guides', false);
    // the cross cursor (on by default since 015) would paint over the probed pixels
    c.set('crossCursor', false);
  });
  await setView(page, 0.5, 40, 40);
  const corner = () => docPixel(page, 6, 6);
  const open = await corner();
  expect(open.slice(0, 3).every((v) => v > 240)).toBe(true); // automatic light: white at the top
  await menu(page, 'View', 'iOS / macOS');
  const masked = await corner();
  expect(masked.slice(0, 3)).not.toEqual(open.slice(0, 3));
  // ±2 per channel: the compositor may round the gradient differently by one level
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 2);
  expect(near(await docPixel(page, 512, 6), open)).toBe(true); // the edge middle is inside the mask
  await menu(page, 'View', 'watchOS');
  expect(near(await docPixel(page, 512, 6), open)).toBe(true);
  expect(near(await docPixel(page, 100, 100), masked)).toBe(true);
  await menu(page, 'View', 'Dark');
  const dark = await docPixel(page, 512, 20);
  expect(dark.slice(0, 3).every((v) => v < 90)).toBe(true);
});

test('zoom shortcuts, buttons and the level list', async ({ page }) => {
  await openIcon(page);
  const zoom = page.getByTestId('canvas-zoom');
  await page.locator('body').press('Control+0');
  await expect(zoom).toHaveText('100 %');
  await page.locator('body').press('Control+=');
  await expect(zoom).toHaveText('125 %');
  await page.locator('body').press('Control+-');
  await page.locator('body').press('Control+-');
  await expect(zoom).toHaveText('75 %');
  await page.getByRole('button', { name: 'Zoom In' }).click();
  await expect(zoom).toHaveText('100 %');
  await page.getByRole('combobox', { name: 'Zoom level' }).selectOption('0.33');
  await expect(zoom).toHaveText('33 %');
  await page.getByRole('button', { name: 'Zoom to Fit' }).click();
  const fitted = await page.evaluate(() => window.__appIconic!.canvas.view());
  await page.evaluate(() => window.__appIconic!.canvas.panBy(-50, 70));
  await page.getByRole('button', { name: 'Center Canvas' }).click();
  expect(await page.evaluate(() => window.__appIconic!.canvas.view())).toEqual(fitted);
});

test('pan with the wheel, Space+drag and the middle button', async ({ page }) => {
  await openIcon(page);
  await setView(page, 0.5, 40, 40);
  const view = () => page.evaluate(() => window.__appIconic!.canvas.view());
  const vp = (await page.locator('app-canvas-view .viewport').boundingBox())!;
  const mid = { x: Math.round(vp.x + vp.width / 2), y: Math.round(vp.y + vp.height / 2) };
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.wheel(0, 30);
  await expect.poll(view).toMatchObject({ zoom: 0.5, panX: 40, panY: 10 });

  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(mid.x + 25, mid.y + 15, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  await expect.poll(view).toMatchObject({ panX: 65, panY: 25 });

  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(mid.x - 5, mid.y, { steps: 2 });
  await page.mouse.up({ button: 'middle' });
  await expect.poll(view).toMatchObject({ panX: 35, panY: 10 });
});

test('rulers, guides and cross cursor follow their toggles', async ({ page }) => {
  await openIcon(page);
  const rulers = page.locator('app-canvas-ruler canvas');
  await expect(rulers).toHaveCount(2);
  const width = await page.evaluate(() => window.__appIconic!.canvas.viewport().width);
  const px = await rulers.first().evaluate((c: HTMLCanvasElement) => c.width);
  expect(px).toBe(Math.round(width * (await page.evaluate(() => devicePixelRatio))));
  await menu(page, 'View', 'Rulers');
  await expect(rulers).toHaveCount(0);
  // the same toggles in the View Options menu of the canvas toolbar (design 005 E10)
  await page.getByRole('button', { name: 'View Options' }).click();
  const options = page.getByRole('menu', { name: 'View Options' });
  await expect(options.getByRole('menuitemcheckbox', { name: 'Rulers' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await options.getByRole('menuitemcheckbox', { name: 'Guides' }).click();
  await expect(page.locator('app-canvas-view svg.host .guides')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(options).toBeHidden();
  // the cross cursor is on by default (design 015 E9, legacy §9)
  const c = await toClient(page, 300, 400);
  await page.mouse.move(c.clientX, c.clientY);
  const cross = page.locator('app-canvas-view .cross-v');
  await expect(cross).toBeVisible();
  expect((await cross.boundingBox())!.x).toBeCloseTo(c.clientX, 0);
  await menu(page, 'View', 'Cross Cursor');
  await page.mouse.move(c.clientX + 4, c.clientY);
  await expect(cross).toBeHidden();
});

test('zoom and pan stay fluid with logo-artv.svg (100 KB)', async ({ page }) => {
  await openIcon(page, '/fixtures/svg/logo-artv.icon');
  const ms = await page.evaluate(async () => {
    const c = window.__appIconic!.canvas;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    await frame();
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      c.zoomBy(i % 2 ? 1.05 : 0.97, { x: 200, y: 200 });
      await frame();
      c.panBy(3, -2);
      await frame();
    }
    return (performance.now() - t0) / 60;
  });
  console.log(`logo-artv: ${ms.toFixed(1)} ms per frame (zoom + pan)`);
  expect(ms).toBeLessThan(50);
});
