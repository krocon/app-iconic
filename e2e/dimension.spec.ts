import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/**
 * Prompt 048 – Measure and Dimension (Chromium, browser mode): measure between two points,
 * dimension an edge, read a circle's radius; the export leaves dimensions out.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string, zoom = 1) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'dim.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, zoom, { x: 400, y: 400 });
}

async function at(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 4 });
}

function dimensions(page: Page) {
  return page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    return [...doc.assets.get('dim.svg')!.svg!.root.querySelectorAll('[data-dimension]')].map(
      (g) => ({
        kind: g.getAttribute('data-dimension'),
        value: Number(g.getAttribute('data-value')),
        text: g.querySelector('text')!.textContent,
      }),
    );
  });
}

test('Measure shows distance and angle, adds nothing', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page, '<rect x="0" y="0" width="4" height="4"/>');
  await page.locator('.viewport').focus();
  await page.keyboard.press('i');
  await at(page, 300, 400);
  await page.mouse.down();
  await at(page, 330, 360);
  await page.mouse.up();
  await expect(page.getByTestId('sketch-hint')).toContainText('Distance 50');
  await expect(page.getByTestId('sketch-hint')).toContainText('Angle 53.1°');
  await expect(page.getByTestId('measure-value')).toContainText('50');
  expect(await dimensions(page)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const zoom of [0.5, 1.5]) {
  test(`dimension an edge by dragging out of it (zoom ${zoom * 100} %)`, async ({ page }) => {
    await setup(
      page,
      '<line x1="300" y1="400" x2="500" y2="400" stroke="#000" stroke-width="2"/>',
      zoom,
    );
    await page.evaluate(() => window.__appIconic!.run('dimension.tool'));
    await at(page, 400, 400);
    await page.mouse.down();
    await at(page, 400, 380);
    await at(page, 400, 350);
    await expect(page.getByTestId('dimension-value')).toContainText('200');
    await page.mouse.up();
    await expect
      .poll(() => dimensions(page))
      .toEqual([{ kind: 'linear', value: 200, text: '200' }]);
    expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
      'Undo Add Dimension',
    );
  });
}

test('a click on a circle picks its radius, the next click places it; Shift: diameter', async ({
  page,
}) => {
  await setup(page, '<circle cx="400" cy="400" r="80" fill="none" stroke="#000"/>');
  await page.evaluate(() => window.__appIconic!.run('dimension.tool'));
  await at(page, 480, 400);
  await page.mouse.down();
  await page.mouse.up();
  await at(page, 560, 360);
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => dimensions(page)).toEqual([{ kind: 'radius', value: 80, text: 'R80' }]);
  await at(page, 400, 320);
  await page.mouse.down();
  await page.mouse.up();
  await at(page, 400, 250);
  await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect
    .poll(async () => (await dimensions(page))[1])
    .toEqual({
      kind: 'diameter',
      value: 160,
      text: '⌀160',
    });
  await frames(page);
});

test('dimension.add for the AI; an angle between two edges', async ({ page }) => {
  await setup(page, '<path d="M 300 400 L 500 400 L 500 200" fill="none" stroke="#000"/>');
  await page.evaluate(() =>
    window.__appIconic!.run('dimension.add', {
      kind: 'angle',
      points: [
        [500, 400],
        [300, 400],
        [500, 200],
      ],
      at: [450, 350],
    }),
  );
  await expect.poll(() => dimensions(page)).toEqual([{ kind: 'angle', value: 90, text: '90°' }]);
});
