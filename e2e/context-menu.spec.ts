import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 070 – the context menu on the canvas, the same model in the tree (Chromium). */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="a" x="100" y="100" width="200" height="200" fill="#c33"/>' +
  '<rect id="b" x="200" y="200" width="200" height="200" fill="#33c"/></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'cm.svg', SVG);
  await snapping(page, false);
  await centerOn(page, 1, { x: 300, y: 300 });
  await page.evaluate(() => window.__appIconic!.store()!.selection.set([]));
}

const selectedIds = (page: Page) =>
  page.evaluate(() => {
    const h = window.__appIconic!;
    return h
      .store()!
      .selection()
      .map((r) => h.store()!.document().node(r)!.getAttribute('id'));
  });

async function rightClick(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.click(c.clientX, c.clientY, { button: 'right' });
  await frames(page);
}

const menu = (page: Page) => page.getByRole('menu', { name: 'Canvas actions' });

test('right click selects the element and opens its menu; Ungroup greyed out for a rect', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  await rightClick(page, 150, 150);
  expect(await selectedIds(page)).toEqual(['a']);
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).locator('[data-action="arrange.ungroup"]')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  // two shapes: Pathfinder ▸ Unite
  await page.evaluate(() => window.__appIconic!.run('edit.selectAll'));
  await rightClick(page, 350, 350);
  expect((await selectedIds(page)).sort()).toEqual(['a', 'b']);
  await menu(page).locator('[data-submenu="submenu:pathfinder"]').hover();
  await menu(page).locator('[data-action="pathfinder.unite"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__appIconic!.store()!.document().assets.get('cm.svg')!.svg!.root.children.length,
      ),
    )
    .toBe(1);
  expect(errors).toEqual([]);
});

test('the empty canvas has its menu; ⇧F10 opens the menu at the selection, keys too', async ({
  page,
}) => {
  await setup(page);
  await rightClick(page, 440, 120);
  await expect(menu(page).locator('[data-action="edit.selectAll"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    h.store()!.select([doc.refOf(doc.assets.get('cm.svg')!.svg!.root.querySelector('#b')!)!]);
  });
  await page.locator('.viewport').focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).locator('[role="menuitem"]').first()).toBeFocused();
  // to "Arrange ▸", → opens it, Enter on "Send to Back"
  const arrange = menu(page).locator('[data-submenu="submenu:arrange"]');
  for (let i = 0; i < 10 && !(await arrange.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(menu(page).locator('[data-action="arrange.bringToFront"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const order = await page.evaluate(() =>
    [...window.__appIconic!.store()!.document().assets.get('cm.svg')!.svg!.root.children].map(
      (e) => e.id,
    ),
  );
  expect(order).toEqual(['b', 'a']);
  await expect(page.locator('.viewport')).toBeFocused();
});
