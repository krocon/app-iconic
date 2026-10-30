import { expect, Page, test } from '@playwright/test';
import { collectErrors, docPixel, openIcon } from './canvas-helpers';

/**
 * Prompt 010 – the icon inspector (Chromium, browser mode with fakes): fill set to a linear
 * gradient → the canvas paints it; undo; the icon.json preview follows and marks the change; a
 * dark variant is created and removed again byte for byte; layer opacity on the canvas; the shadow
 * approximation; renaming an asset file goes into the save request.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const panel = (page: Page) => page.locator('app-properties-panel');

async function selectItem(page: Page, item: object) {
  await page.evaluate((item) => window.__appIconic!.run('edit.select', { items: [item] }), item);
}

const iconJson = (page: Page) =>
  page.evaluate(() => JSON.stringify(window.__appIconic!.store()!.document().iconJson));

test('fill → linear gradient on the canvas, undo, preview marks the change', async ({ page }) => {
  const errors = collectErrors(page);
  await openIcon(page);
  await page.evaluate(() => window.__appIconic!.canvas.set('appearance', 'light'));
  await selectItem(page, { kind: 'root' });
  await expect(panel(page).getByTestId('properties-kind')).toHaveText('Icon');
  const preview = panel(page).getByTestId('json-preview');
  await expect(preview).toContainText('"fill" : "automatic"');

  await panel(page).locator('#icon-background-kind').selectOption('linear-gradient');
  await expect(page.locator('app-canvas-background linearGradient')).toHaveCount(1);
  await expect(preview).toContainText('"linear-gradient" : [');
  await expect(preview.locator('.changed').first()).toContainText('"fill" : {');
  // the canvas: top = the first colour (blue of the palette), bottom darker
  const top = await docPixel(page, 512, 24);
  const bottom = await docPixel(page, 512, 1000);
  expect(top[2]).toBeGreaterThan(200);
  expect(top[0]).toBeLessThan(80);
  expect(bottom[2]).toBeLessThan(top[2]);
  expect(await page.locator('#icon-background-color-0').inputValue()).toBe('#0088FF');

  // a colour typed as hex keeps the colour space of the file
  await panel(page).locator('#icon-background-color-1').fill('#000000');
  await panel(page).locator('#icon-background-color-1').press('Enter');
  await expect(preview).toContainText('"display-p3:0.00000,0.00000,0.00000,1.00000"');
  const s = await page.evaluate(() => window.__appIconic!.store()!.undoLabel());
  expect(s).toBe('Undo Change Background');

  await page.locator('header.toolbar').getByRole('button', { name: /^Undo/ }).click();
  await page.locator('header.toolbar').getByRole('button', { name: /^Undo/ }).click();
  await expect(page.locator('app-canvas-background linearGradient')).toHaveCount(1); // system gradient
  await expect(preview).toContainText('"fill" : "automatic"');
  await expect(preview).not.toContainText('linear-gradient');
  expect(errors).toEqual([]);
});

test('dark variant: created by editing in Dark, removed again = same bytes', async ({ page }) => {
  await openIcon(page);
  await selectItem(page, { kind: 'root' });
  const before = await iconJson(page);
  await panel(page).getByTestId('appearance-dark').click();
  await expect
    .poll(() => page.evaluate(() => window.__appIconic!.canvas.options().appearance))
    .toBe('dark');
  await panel(page).locator('#icon-background-kind').selectOption('solid');
  const json = JSON.parse(await iconJson(page));
  expect(json.fill).toBeUndefined();
  expect(json['fill-specializations']).toEqual([
    { value: 'automatic' },
    { appearance: 'dark', value: { solid: 'display-p3:0.00000,0.53333,1.00000,1.00000' } },
  ]);
  expect(Object.keys(json)[0]).toBe('fill-specializations');
  // the dark canvas paints the solid colour
  const c = await docPixel(page, 512, 24);
  expect(c[2]).toBeGreaterThan(200);
  // Default still shows Automatic; back in Dark the variant is removed
  await panel(page).getByTestId('appearance-default').click();
  await expect(panel(page).locator('#icon-background-kind')).toHaveValue('automatic');
  await panel(page).getByTestId('appearance-dark').click();
  await panel(page).getByTestId('remove-variant').first().click();
  expect(await iconJson(page)).toBe(before);
  await expect(panel(page).getByTestId('remove-variant')).toHaveCount(0);
});

test('layer opacity, shadow approximation, Other properties, rename file', async ({ page }) => {
  const errors = collectErrors(page);
  await openIcon(page);
  await selectItem(page, { kind: 'layer', group: 0, layer: 0 });
  await expect(panel(page).getByTestId('properties-kind')).toHaveText('logo-scanner 3');
  const opacity = panel(page).locator('#l0-0-opacity');
  await expect(opacity).toHaveValue('1');
  await opacity.fill('0.3');
  await opacity.press('Enter');
  const layerOpacity = () =>
    page.evaluate(() => {
      const host = document.querySelector('.layer[data-group="0"][data-layer="0"]');
      return host?.shadowRoot?.querySelector('svg > g')?.getAttribute('opacity') ?? null;
    });
  await expect.poll(layerOpacity).toBe('0.3');
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Change Layer Opacity',
  );

  // the group's shadow is drawn as an SVG filter in the layer's shadow root
  const filterKind = () =>
    page.evaluate(() => {
      const host = document.querySelector('.layer[data-group="0"][data-layer="0"]');
      return (
        host?.shadowRoot?.querySelector('filter#ai-fx-shadow')?.getAttribute('data-kind') ?? null
      );
    });
  expect(await filterKind()).toBe('neutral');
  await selectItem(page, { kind: 'group', group: 0 });
  await expect(panel(page).locator('[data-note="approximation"]').first()).toBeVisible();
  await panel(page).locator('#g0-shadow\\.kind').selectOption('layer-color');
  await expect.poll(filterKind).toBe('layer-color');
  await panel(page).locator('#g0-shadow\\.kind').selectOption('none');
  await expect.poll(filterKind).toBe(null);
  // translucency as an opacity gradient over the group
  await expect(page.locator('.group[data-group="0"]')).toHaveAttribute('data-translucency', '0.5');
  await panel(page).locator('#g0-translucency\\.enabled').uncheck();
  await expect(page.locator('.group[data-group="0"]')).not.toHaveAttribute('data-translucency');
  await expect(panel(page).getByTestId('other-properties')).toContainText('None');

  // renaming the file: every reference follows, the save request names the old file
  await selectItem(page, { kind: 'layer', group: 0, layer: 0 });
  const file = panel(page).locator('#l0-0-file');
  await file.fill('scanner');
  await file.press('Enter');
  await expect(file).toHaveValue('scanner.svg');
  await page.evaluate(() => window.__appIconic!.run('file.save'));
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__appIconic!.files.saved.at(-1)?.assets.find((a) => a.name === 'scanner.svg'),
      ),
    )
    .toEqual({ name: 'scanner.svg', unchanged: true, source: 'logo-scanner 3.svg' });
  expect(errors).toEqual([]);
});

test('the AI sets the fill through an action (icon.setFill)', async ({ page }) => {
  await openIcon(page);
  await page.evaluate(() =>
    window.__appIconic!.run('icon.setFill', {
      fill: { solid: 'srgb:1.00000,0.00000,0.00000,1.00000' },
    }),
  );
  await page.evaluate(() => window.__appIconic!.canvas.set('appearance', 'light'));
  await expect(page.locator('app-canvas-background rect')).toHaveCSS('fill', 'color(srgb 1 0 0)');
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Change Background',
  );
});
