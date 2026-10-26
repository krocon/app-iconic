import { expect, Page } from '@playwright/test';
import { menu } from './menu-helpers';

/** Helpers of the canvas tests (prompt 004, browser mode with fakes – design 004 E16). */

export const SVG_FIXTURE_NAMES = [
  '_1014x1024_demo.svg',
  '_logo-artv.svg',
  'demo-elemente-with-hexcodes.svg',
  'demo-elemente.svg',
  'logo-artv.svg',
  'logo-scanner.svg',
  'nested_g.svg',
  'nested_g_small.svg',
  'some_pathes.svg',
];

/** Collects console errors and page errors. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

/** Opens `path` of the fake (default camscanner.icon) in a fresh window. */
export async function openIcon(page: Page, path?: string): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveTitle('Untitled');
  if (path) await page.evaluate((p) => window.__appIconic!.pick(p), path);
  await menu(page, 'File', 'Open…');
  await expect(page).not.toHaveTitle('Untitled');
  await waitForCanvas(page);
}

/** Waits until the canvas has its size and the layers are painted. */
export async function waitForCanvas(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__appIconic!.canvas.viewport().width))
    .toBeGreaterThan(0);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

/** Sets zoom and pan directly (then waits a frame). */
export async function setView(page: Page, zoom: number, panX: number, panY: number) {
  await page.evaluate(
    ([zoom, panX, panY]) => window.__appIconic!.canvas.view.set({ zoom, panX, panY }),
    [zoom, panX, panY],
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

export async function toClient(page: Page, x: number, y: number) {
  const c = await page.evaluate(([x, y]) => window.__appIconic!.documentToClient(x, y), [x, y]);
  return c!;
}

/** Imports SVG markup as a new group (at the end = bottom, design 004 E3). */
export async function importSvg(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(
    ([name, text]) => window.__appIconic!.addSvgFile(`/in/${name}`, name, text),
    [name, text],
  );
  await menu(page, 'File', 'Import SVG…');
  await expect(page.getByRole('list', { name: 'Groups and layers' })).toContainText(
    name.replace('.svg', ''),
  );
}

/** RGBA of the screen pixel at a client position (decoded in the page, no PNG library). */
export async function pixel(page: Page, clientX: number, clientY: number): Promise<number[]> {
  const png = await page.screenshot({
    clip: { x: Math.round(clientX), y: Math.round(clientY), width: 1, height: 1 },
  });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  }, png.toString('base64'));
}

/** Pixel of a document point. */
export async function docPixel(page: Page, x: number, y: number): Promise<number[]> {
  const c = await toClient(page, x, y);
  return pixel(page, c.clientX, c.clientY);
}

/** A full-canvas SVG with a rect in a colour from a gradient with id `g` (id clash test). */
export function gradientSvg(color: string, x: number, width: number): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
    `<defs><linearGradient id="g"><stop offset="0" stop-color="${color}"/>` +
    `<stop offset="1" stop-color="${color}"/></linearGradient></defs>` +
    `<rect x="${x}" y="0" width="${width}" height="1024" fill="url(#g)"/></svg>`
  );
}
