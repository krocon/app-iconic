import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 073 – compact properties, popovers with live preview on the canvas. */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="a" x="100" y="100" width="300" height="200" fill="#c33"/>' +
  '<circle id="c" cx="700" cy="700" r="100" fill="#33c"/>' +
  '<path id="p" d="M100 600 L150 610 L200 600 L250 612 L300 600 L350 611 L400 600" ' +
  'fill="none" stroke="#000"/></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'compact.svg', SVG);
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
}

const select = (page: Page, id: string) =>
  page.evaluate((id) => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    for (const a of doc.assets.values()) {
      const el = a.svg?.root.querySelector(`[id="${id}"]`);
      if (el) h.store()!.select([doc.refOf(el)!]);
    }
  }, id);

const undoDepth = (page: Page) => page.evaluate(() => window.__appIconic!.store()!.undoLabel());

test('a rect: pairs side by side, icon toggles for caps and joins', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await select(page, 'a');
  const geo = page.locator('[data-section="geometry"]');
  await expect(geo.locator('[data-pair="x+y"]')).toBeVisible();
  await expect(geo.locator('[data-pair="width+height"]')).toBeVisible();
  const wide = (await geo.boundingBox())!.height;
  // a narrow panel: one column
  await page.evaluate(() =>
    window.__appIconic!.run('view.panelWidth', { panel: 'properties', width: 200 }),
  );
  await frames(page);
  const narrow = (await geo.boundingBox())!.height;
  console.log(`geometry section of a rect: ${wide} px in pairs, ${narrow} px in one column`);
  expect(wide).toBeLessThan(narrow * 0.7);
  await page.evaluate(() =>
    window.__appIconic!.run('view.panelWidth', { panel: 'properties', width: 300 }),
  );
  // Line Join as icon toggles: a click sets it, the arrows move on
  const join = page
    .locator('[role="radiogroup"]')
    .filter({ has: page.locator('[data-option="bevel"]') });
  await join.locator('[data-option="round"]').click();
  expect(
    await page.evaluate(() => {
      const h = window.__appIconic!;
      return h.store()!.document().node(h.store()!.selection()[0])!.getAttribute('stroke-linejoin');
    }),
  ).toBe('round');
  await join.locator('[data-option="round"]').press('ArrowRight');
  await expect(join.locator('[data-option="bevel"]')).toHaveAttribute('aria-checked', 'true');
  await expect(join.locator('[data-option="bevel"]')).toBeFocused();
  expect(errors).toEqual([]);
});

test('Corners as a popover: live preview, the canvas stays usable, Esc leaves no undo step', async ({
  page,
}) => {
  await setup(page);
  await select(page, 'a');
  const before = await undoDepth(page);
  await page.evaluate(() => window.__appIconic!.run('corners.set'));
  const pop = page.locator('[role="dialog"][data-popover]');
  await expect(pop).toBeVisible();
  await expect(pop).not.toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('.backdrop:not(.popover-host)')).toHaveCount(0);
  const radius = pop.getByTestId('corners-radius').locator('input');
  await radius.fill('40');
  await radius.dispatchEvent('input');
  // the canvas shows it at once (a rect with corners: rx)
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = window.__appIconic!;
        const doc = h.store()!.document();
        const el = [...doc.assets.values()]
          .map((a) => a.svg?.root.querySelector('[id="a"]'))
          .find(Boolean);
        return el?.getAttribute('rx') ?? el?.getAttribute('d') ?? null;
      }),
    )
    .not.toBeNull();
  // a click on another element on the canvas works while the popover is open
  await centerOn(page, 1, { x: 650, y: 650 });
  const c = await toClient(page, 700, 700);
  await page.mouse.click(c.clientX, c.clientY);
  await expect(pop).toBeVisible();
  expect(
    await page.evaluate(() => {
      const h = window.__appIconic!;
      return h.store()!.document().node(h.store()!.selection()[0])!.getAttribute('id');
    }),
  ).toBe('c');
  // Esc in the popover: everything back, no undo step
  await radius.focus();
  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  expect(await undoDepth(page)).toBe(before);
  expect(
    await page.evaluate(() => {
      const h = window.__appIconic!;
      const el = [...h.store()!.document().assets.values()]
        .map((a) => a.svg?.root.querySelector('[id="a"]'))
        .find(Boolean)!;
      return [el.localName, el.getAttribute('rx')];
    }),
  ).toEqual(['rect', null]);
});

test('Optimize Path shows before / after on the canvas; Cancel leaves no undo step', async ({
  page,
}) => {
  await setup(page);
  await select(page, 'p');
  const before = await undoDepth(page);
  await page.evaluate(() => window.__appIconic!.run('path.optimize'));
  const pop = page.locator('[role="dialog"][data-popover]');
  await expect(pop).toBeVisible();
  const overlay = page.getByTestId('path-preview');
  await expect(overlay.locator('path.before')).toHaveCount(1);
  await expect(overlay.locator('path.after')).toHaveCount(1);
  await pop.getByTestId('optimize-epsilon').fill('20');
  await expect
    .poll(async () => (await overlay.locator('path.after').getAttribute('d'))!.length)
    .toBeLessThan((await overlay.locator('path.before').getAttribute('d'))!.length);
  await pop.getByTestId('optimize-epsilon').press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(overlay).toHaveCount(0);
  expect(await undoDepth(page)).toBe(before);
});
