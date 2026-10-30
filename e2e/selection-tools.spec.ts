import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';

/**
 * Prompt 061 – selection tools and the visible tool state (Chromium, browser mode with fakes):
 * V ends any tool and selects with the box, A edits points; every tool is checked while on (the
 * sidebar marks it, also folded – a shape group shows its active variant), and the status line
 * names it.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'sel.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="r1" x="100" y="100" width="200" height="200" fill="#c33"/>' +
  '<path id="p1" d="M500 100L700 100L700 300z" fill="#3c3"/></svg>';

/** Every tool that switches on without a selection (prompts 013, 019, 042–060). */
const TOOLS = [
  'add.freehand',
  'sketch.line',
  'sketch.dragRect',
  'sketch.circle3t',
  'sketch.dragStar',
  'pen.tool',
  'curvature.tool',
  'trim.tool',
  'extend.tool',
  'fillet.tool',
  'chamfer.tool',
  'fill.tool',
  'constraint.tool',
  'dimension.tool',
  'measure.tool',
];

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, SVG);
  await page.evaluate(() => window.__appIconic!.run('edit.deselect'));
}

function checked(page: Page, id: string) {
  return page.evaluate((i) => window.__appIconic!.actions().find((a) => a.id === i)?.checked, id);
}

function selectedCount(page: Page) {
  return page.evaluate(() => window.__appIconic!.store()!.selection().length);
}

test('V ends the pen; a click selects again; A is the point mode', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.keyboard.press('p');
  expect(await checked(page, 'pen.tool')).toBe(true);
  expect(await checked(page, 'tool.select')).toBe(false);
  await expect(page.getByTestId('tool-name')).toHaveText('Pen');
  await page.keyboard.press('v');
  expect(await checked(page, 'pen.tool')).toBe(false);
  expect(await checked(page, 'tool.select')).toBe(true);
  expect(await checked(page, 'view.selectionMode.boxed')).toBe(true);
  await expect(page.getByTestId('tool-name')).toHaveText('Selection Tool');
  const c = await toClient(page, 200, 200);
  await page.mouse.click(c.clientX, c.clientY);
  expect(await selectedCount(page)).toBe(1);
  await page.keyboard.press('a');
  expect(await checked(page, 'tool.direct')).toBe(true);
  expect(await checked(page, 'tool.select')).toBe(false);
  expect(await checked(page, 'view.selectionMode.point')).toBe(true);
  await expect(page.getByTestId('tool-name')).toHaveText('Direct Selection Tool');
  expect(errors).toEqual([]);
});

test('every tool is checked while on and named in the status line; V ends it', async ({ page }) => {
  await setup(page);
  for (const id of TOOLS) {
    const label = await page.evaluate(
      (i) => window.__appIconic!.actions().find((a) => a.id === i)!.label,
      id,
    );
    expect(await page.evaluate((i) => window.__appIconic!.run(i), id), id).toBe(true);
    expect(await checked(page, id), id).toBe(true);
    expect(await checked(page, 'tool.select'), id).toBe(false);
    await expect(page.getByTestId('tool-name'), id).toHaveText(label);
    await expect(page.locator(`app-command-sidebar [data-action="tool.select"]`)).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await page.evaluate(() => window.__appIconic!.run('tool.select'));
    expect(await checked(page, id), id).toBe(false);
  }
});

test('tools need a selection too: the path tools and transform switch off with V', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('edit.selectAll'));
  for (const id of ['transform.rotate', 'shapeBuilder.tool']) {
    expect(await page.evaluate((i) => window.__appIconic!.run(i), id), id).toBe(true);
    expect(await checked(page, id), id).toBe(true);
    await page.keyboard.press('v');
    expect(await checked(page, id), id).toBe(false);
  }
});

test('the sidebar marks the active tool; folded, the group shows the active variant', async ({
  page,
}) => {
  await setup(page);
  const list = page.locator('app-command-sidebar');
  // the default selection mode is "Point" (design 007 E4): the direct selection is on
  await expect(list.locator('[data-action="tool.direct"]')).toHaveClass(/checked/);
  await expect(list.locator('[data-action="tool.direct"]')).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(() => window.__appIconic!.run('pen.tool'));
  const path = list.locator('[data-group="path"]');
  await expect(path).toHaveClass(/checked/);
  await expect(path).toHaveAttribute('aria-label', /active: Pen/);
  // fold the panel: icons only
  await page.evaluate(() => window.__appIconic!.run('view.commandSidebar'));
  const rail = page.locator('app-command-sidebar [role="toolbar"]');
  await expect(rail).toBeVisible();
  const group = rail.locator('[data-group="path"]');
  await expect(group).toHaveClass(/checked/);
  const pen = await page.evaluate(() => {
    const el = document.querySelector('app-command-sidebar [data-group="path"] path');
    return el?.getAttribute('d');
  });
  expect(pen).toBeTruthy();
  await rail.locator('[data-action="tool.select"]').click();
  await expect(rail.locator('[data-action="tool.select"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(group).not.toHaveClass(/checked/);
  // the group keeps the icon of the last used variant
  expect(
    await page.evaluate(() =>
      document.querySelector('app-command-sidebar [data-group="path"] path')?.getAttribute('d'),
    ),
  ).toBe(pen);
  await rail.locator('[data-action="add.freehand"]').click();
  await expect(rail.locator('[data-action="add.freehand"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
