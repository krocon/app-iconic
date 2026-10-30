import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 074 – eyedropper, document colours, replace, alpha in the colour popover. */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<circle id="c" cx="250" cy="250" r="100" fill="#FF0000"/>' +
  '<rect id="r" x="400" y="150" width="200" height="200" fill="#0000ff"/>' +
  '<path id="p" d="M100 500h300v100H100z" style="fill: #ff0000"/></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'colors.svg', SVG);
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 350 });
}

const attr = (page: Page, id: string, name: string) =>
  page.evaluate(
    ([id, name]) => {
      for (const a of window.__appIconic!.store()!.document().assets.values()) {
        const el = a.svg?.root.querySelector(`[id="${id}"]`);
        if (el) return el.getAttribute(name);
      }
      return null;
    },
    [id, name],
  );

const select = (page: Page, id: string) =>
  page.evaluate((id) => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    for (const a of doc.assets.values()) {
      const el = a.svg?.root.querySelector(`[id="${id}"]`);
      if (el) h.store()!.select([doc.refOf(el)!]);
    }
  }, id);

test('the eyedropper takes the red of the circle into the selected rect; undo', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  await select(page, 'r');
  await page.locator('.viewport').focus();
  await page.keyboard.press('Shift+I');
  await expect(page.getByTestId('tool-name')).toContainText('Eyedropper');
  const c = await toClient(page, 250, 250);
  await page.mouse.click(c.clientX, c.clientY);
  await expect.poll(() => attr(page, 'r', 'fill')).toBe('#FF0000');
  // Shift: the stroke
  await page.keyboard.down('Shift');
  await page.mouse.click(c.clientX, c.clientY);
  await page.keyboard.up('Shift');
  await expect.poll(() => attr(page, 'r', 'stroke')).toBe('#FF0000');
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await attr(page, 'r', 'fill')).toBe('#0000ff');
  expect(errors).toEqual([]);
});

test('red is replaced by green in the whole icon from the document colours; undo', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => window.__appIconic!.store()!.selection.set([]));
  const section = page.getByTestId('colors-section');
  await section.locator('summary').click();
  await section.locator('[data-color="#FF0000"]').click();
  await page.getByTestId('colors-replace-with').click();
  const picker = page.getByTestId('color-picker');
  await expect(picker).toBeVisible();
  await picker.getByTestId('color-text').fill('#00FF00');
  await picker.getByTestId('color-text').press('Enter');
  await expect(picker).toHaveCount(0);
  await expect.poll(() => attr(page, 'c', 'fill')).toBe('#00FF00');
  // the import turned its style into an attribute (design 003 E5)
  expect(await attr(page, 'p', 'fill')).toBe('#00FF00');
  expect(await attr(page, 'r', 'fill')).toBe('#0000ff');
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Replace Color',
  );
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await attr(page, 'c', 'fill')).toBe('#FF0000');
});

test('alpha 50 % in the fill popover writes #RRGGBB80; Esc takes it back', async ({ page }) => {
  await setup(page);
  await select(page, 'c');
  const fill = page.locator('[data-section="appearance"] app-color-field').first();
  await fill.locator('app-color-button button').click();
  const picker = page.getByTestId('color-picker');
  await picker.getByTestId('color-alpha').fill('50');
  await expect.poll(() => attr(page, 'c', 'fill')).toBe('#FF000080');
  await picker.getByTestId('color-alpha').press('Escape');
  await expect(picker).toHaveCount(0);
  await expect.poll(() => attr(page, 'c', 'fill')).toBe('#FF0000');
  // again, Done keeps it as one step
  await fill.locator('app-color-button button').click();
  await picker.getByTestId('color-alpha').fill('50');
  await picker.getByTestId('color-done').click();
  await frames(page);
  expect(await attr(page, 'c', 'fill')).toBe('#FF000080');
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Change Fill',
  );
});
