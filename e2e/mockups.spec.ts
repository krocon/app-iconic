import { expect, Page, test } from '@playwright/test';
import { collectErrors, waitForCanvas } from './canvas-helpers';

/** Prompt 081 – "In Context": scenes follow the document; the dark scene shows the dark variant. */
test.use({ viewport: { width: 1440, height: 900 } });

const SCENES = ['dock', 'homeLight', 'homeDark', 'spotlight', 'taskbar'];

/** The icon SVG nested in each scene image (decoded in the page). */
function nestedIcons(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate((ids) => {
    const text = (url: string) => {
      const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    };
    const out: Record<string, string | null> = {};
    for (const id of ids) {
      const src = document.querySelector<HTMLImageElement>(`[data-testid="scene-${id}"] img`)?.src;
      if (!src) {
        out[id] = null;
        continue;
      }
      const scene = new DOMParser().parseFromString(text(src), 'image/svg+xml');
      const href = scene.querySelector('image[data-own]')?.getAttribute('href');
      out[id] = href ? text(href) : null;
    }
    return out;
  }, SCENES);
}

/** Average colour of a square inside the scene image (scene points). */
function sample(page: Page, id: string, x: number, y: number, size = 6) {
  return page.evaluate(
    async ({ id, x, y, size }) => {
      const img = document.querySelector<HTMLImageElement>(`[data-testid="scene-${id}"] img`)!;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0, img.width, img.height);
      const d = ctx.getImageData(x, y, size, size).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
      return sum.map((v) => Math.round(v / (size * size)));
    },
    { id, x, y, size },
  );
}

async function open(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await page.evaluate(() => window.__appIconic!.run('view.mockups'));
  await expect(page.getByTestId('mockups')).toBeVisible();
  for (const id of SCENES) {
    await expect(page.getByTestId(`scene-${id}`).locator('img')).toBeVisible();
  }
}

test('adding a circle updates every scene; the canvas stays usable', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const before = await nestedIcons(page);
  for (const id of SCENES) expect(before[id]).not.toContain('#00f');
  await page.evaluate(() =>
    window.__appIconic!.run('add.circle', { cx: 512, cy: 512, r: 200, fill: '#00f' }),
  );
  await expect
    .poll(async () => Object.values(await nestedIcons(page)).every((t) => t?.includes('#00f')))
    .toBe(true);
  // a popover: still open after editing, the canvas got the circle
  await expect(page.getByTestId('mockups')).toBeVisible();
  // the circle is visible in the home screen's icon (60 pt at x 108, y 112: centre 138, 142)
  const blue = await sample(page, 'homeLight', 135, 139);
  expect(blue[2]).toBeGreaterThan(150);
  expect(blue[0]).toBeLessThan(80);
  if (process.env['SHOT']) await page.screenshot({ path: process.env['SHOT'], fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('mockups')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the dark scene shows the dark variant, per scene switchable', async ({ page }) => {
  await open(page);
  const icons = await nestedIcons(page);
  // dark system background of the export (077/078)
  expect(icons.homeDark).toContain('#3a3a3c');
  expect(icons.homeLight).not.toContain('#3a3a3c');
  await expect(page.getByTestId('scene-homeDark')).toHaveAttribute('data-appearance', 'dark');
  // pixels: the icon's corner area is dark in the dark scene, light in the light one
  const dark = await sample(page, 'homeDark', 112, 116);
  const light = await sample(page, 'homeLight', 112, 116);
  const lum = (c: number[]) => (c[0] + c[1] + c[2]) / 3;
  expect(lum(dark)).toBeLessThan(lum(light) - 40);
  // switch the dark home screen to Light by keyboard: the icon becomes the light one
  const radio = page.getByTestId('scene-homeDark').getByRole('radio', { name: 'Light' });
  await radio.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('scene-homeDark')).toHaveAttribute('data-appearance', 'light');
  await expect.poll(async () => (await nestedIcons(page)).homeDark).toBe(icons.homeLight);
});

test('copy and save a scene as PNG through the backend', async ({ page }) => {
  await open(page);
  await page.getByTestId('scene-spotlight').getByRole('button', { name: 'Copy as PNG' }).click();
  await page.getByTestId('scene-taskbar').getByRole('button', { name: 'Save as PNG…' }).click();
  const scenes = await page.evaluate(() =>
    window.__appIconic!.exporter.scenes.map((s) => ({
      scale: s.scale,
      path: s.path,
      scene: /data-scene="(\w+)"/.exec(s.svg)?.[1],
    })),
  );
  expect(scenes).toEqual([
    { scale: 2, path: null, scene: 'spotlight' },
    { scale: 2, path: '/export/Untitled – Windows taskbar.png', scene: 'taskbar' },
  ]);
});
