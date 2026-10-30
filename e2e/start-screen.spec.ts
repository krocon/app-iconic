import { expect, Page, test } from '@playwright/test';

/**
 * The start screen (prompt 082): with `startup = startScreen` in the stored settings (the browser
 * mode keeps settings.json in localStorage – a reload is the restart, design 015 E18) the window
 * starts on it; a template opens as an untitled document with keylines; opened files come back
 * with a preview.
 */

const KEY = 'appIconic.settings';

async function startWithScreen(page: Page) {
  await page.goto('/');
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify({ startup: 'startScreen' }));
  }, KEY);
  await page.reload();
  await expect(page.getByTestId('start-screen')).toBeVisible();
}

test.afterEach(async ({ page }) => {
  await page.evaluate((key) => localStorage.removeItem(key), KEY);
});

test('the browser mode starts on the start screen; a template opens untitled with keylines', async ({
  page,
}) => {
  await startWithScreen(page);
  await expect(page.locator('.workspace')).toBeHidden();
  const templates = page.getByRole('grid', { name: 'Templates' });
  await expect(templates.getByRole('gridcell')).toHaveCount(4);
  // the previews are real images
  await expect
    .poll(() =>
      templates
        .locator('img')
        .evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0)),
    )
    .toBe(true);
  // keyboard: the first template has the focus, arrows move it, Enter opens
  const first = templates.getByRole('gridcell', { name: /iOS App Icon/ });
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const mac = templates.getByRole('gridcell', { name: /macOS Icon/ });
  await expect(mac).toBeFocused();
  // the focus is visible, and the grid is one tab stop (APG Grid)
  await expect(mac).toHaveCSS('outline-style', 'solid');
  await expect(templates.locator('[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('start-screen')).toBeHidden();
  await expect(page.getByTestId('doc-title')).toContainText('Untitled');
  // the keylines of 056: guides in the layer, drawn on the canvas
  const guides = await page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    return [...doc.assets.values()].flatMap((a) =>
      Array.from(a.svg!.root.querySelectorAll('[data-guide]')).map((g) =>
        g.getAttribute('data-guide'),
      ),
    );
  });
  expect(guides.length).toBe(10);
  await expect(page.locator('app-canvas-view .layer').first()).toBeVisible();
  const painted = await page
    .locator('app-canvas-view .layer')
    .evaluateAll((layers) =>
      layers.reduce((n, l) => n + (l.shadowRoot?.querySelectorAll('[data-guide]').length ?? 0), 0),
    );
  expect(painted).toBe(10);
});

test('an opened file comes back under "Recently Used" with its preview', async ({ page }) => {
  await startWithScreen(page);
  await expect(page.getByTestId('start-no-recent')).toBeVisible();
  // Open… (the browser mode's dialog answers with camscanner.icon)
  await page.getByTestId('start-open').click();
  await expect(page.getByTestId('start-screen')).toBeHidden();
  await expect(page.getByTestId('doc-title')).toContainText('camscanner.icon');
  await expect.poll(() => page.evaluate(() => window.__appIconic!.recent.thumbnails.size)).toBe(1);
  await page.evaluate(() => window.__appIconic!.run('file.startScreen'));
  const recent = page.getByRole('grid', { name: 'Recently Used' });
  const cell = recent.getByRole('gridcell', { name: 'camscanner.icon, /fixtures' });
  await expect(cell).toBeFocused();
  await expect
    .poll(() => cell.locator('img').evaluate((i) => (i as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  // Esc goes back to the document behind it
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('start-screen')).toBeHidden();
  await expect(page.getByTestId('doc-title')).toContainText('camscanner.icon');
});

test('without stored settings the browser mode starts on an empty document as before', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('doc-title')).toContainText('Untitled');
  await expect(page.getByTestId('start-screen')).toHaveCount(0);
});
