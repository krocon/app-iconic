import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 058 – draw as construction (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(
    page,
    'c.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="4" height="4"/></svg>',
  );
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
}

async function line(page: Page, y: number) {
  await page.evaluate(() => window.__appIconic!.run('sketch.line'));
  for (const x of [300, 500]) {
    const c = await toClient(page, x, y);
    await page.mouse.move(c.clientX, c.clientY, { steps: 2 });
    await page.mouse.down();
    await page.mouse.up();
    await frames(page);
  }
  await page.keyboard.press('Escape');
}

function lines(page: Page) {
  return page.evaluate(() =>
    [
      ...window
        .__appIconic!.store()!
        .document()
        .assets.get('c.svg')!
        .svg!.root.querySelectorAll('line'),
    ].map((l) => [l.hasAttribute('data-construction'), l.getAttribute('opacity')]),
  );
}

test('construction mode on: drawn lines are construction; off: normal again', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.getByTestId('construction-mode').click();
  await expect(page.getByTestId('construction-mode')).toHaveAttribute('aria-pressed', 'true');
  await line(page, 300);
  await page.locator('.viewport').focus();
  await page.keyboard.press('Shift+X');
  await expect(page.getByTestId('construction-mode')).toHaveAttribute('aria-pressed', 'false');
  await line(page, 400);
  expect(await lines(page)).toEqual([
    [true, '0'],
    [false, null],
  ]);
  expect(errors).toEqual([]);
});
