import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, openIcon } from './canvas-helpers';
import { menu } from './menu-helpers';

/**
 * Prompt 006 – the hierarchy with real layout (Chromium, browser mode with fakes): align with the
 * transformed nested groups of nested_g.svg, drag & drop with the mouse, keyboard, visibility,
 * context menu and copy/paste between documents.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const NESTED = 'nested_g.svg';
const tree = (page: Page) => page.getByRole('tree');
const row = (page: Page, id: string) => tree(page).locator(`[data-row="${id}"]`);

/** `data-ai-id`s of the elements `selector` finds in an asset. */
function ids(page: Page, asset: string, selector: string): Promise<string[]> {
  return page.evaluate(
    ([asset, selector]) => {
      const root = window.__appIconic!.store()!.document().assets.get(asset)!.svg!.root;
      return [...root.querySelectorAll(selector)].map((e) => e.getAttribute('data-ai-id')!);
    },
    [asset, selector],
  );
}

async function select(page: Page, asset: string, list: string[]) {
  const ok = await page.evaluate(
    ([asset, list]) =>
      window.__appIconic!.run('edit.select', {
        nodes: (list as string[]).map((id) => ({ asset, id })),
      }),
    [asset, list] as const,
  );
  expect(ok).toBe(true);
}

const bounds = (page: Page, asset: string, list: string[]) =>
  page.evaluate(
    ([asset, list]) =>
      (list as string[]).map((id) => window.__appIconic!.nodeBounds(asset as string, id)!),
    [asset, list] as const,
  );

const groupNames = (page: Page) =>
  page.evaluate(() =>
    (window.__appIconic!.store()!.document().iconJson.groups ?? []).map((g) => g.layers?.[0]?.name),
  );

/** Drags the centre of row `from` to a fraction of the height of row `to` (0 = top, 1 = bottom). */
async function dragRow(page: Page, from: string, to: string, frac: number) {
  const a = (await row(page, from).boundingBox())!;
  const b = (await row(page, to).boundingBox())!;
  await page.mouse.move(a.x + 60, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + a.height / 2 + 8, { steps: 2 });
  await page.mouse.move(b.x + 60, b.y + b.height * frac, { steps: 6 });
  await page.mouse.up();
}

test('align with transformed nested groups (nested_g.svg): bounds meet within ±0.5', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await openIcon(page, '/fixtures/svg/nested_g.icon');
  const texts = await ids(page, NESTED, 'text');
  // texts inside groups with translate, scale and matrix transforms, at different depths
  const picked = [texts[1], texts[6], texts[11], texts[14]];
  const sides: Record<
    string,
    (r: { x: number; y: number; width: number; height: number }) => number
  > = {
    left: (r) => r.x,
    centerH: (r) => r.x + r.width / 2,
    right: (r) => r.x + r.width,
    top: (r) => r.y,
    middle: (r) => r.y + r.height / 2,
    bottom: (r) => r.y + r.height,
  };
  for (const [mode, side] of Object.entries(sides)) {
    await select(page, NESTED, picked);
    const before = await bounds(page, NESTED, picked);
    expect(new Set(before.map((r) => Math.round(side(r)))).size).toBeGreaterThan(1);
    expect(await page.evaluate((m) => window.__appIconic!.run(`arrange.align.${m}`), mode)).toBe(
      true,
    );
    const after = await bounds(page, NESTED, picked);
    const want =
      mode === 'left' || mode === 'top'
        ? Math.min(...before.map(side))
        : mode === 'right' || mode === 'bottom'
          ? Math.max(...before.map(side))
          : null;
    const values = after.map(side);
    for (const v of values) expect(Math.abs(v - values[0]), mode).toBeLessThanOrEqual(0.5);
    if (want !== null) expect(Math.abs(values[0] - want), mode).toBeLessThanOrEqual(0.5);
    // sizes do not change, only the position
    after.forEach((r, i) => expect(Math.abs(r.width - before[i].width)).toBeLessThanOrEqual(0.5));
    // one undo step "Change Transform" puts everything back
    await expect(page.getByRole('button', { name: 'Undo Change Transform' })).toBeEnabled();
    await page.evaluate(() => window.__appIconic!.run('edit.undo'));
    const back = await bounds(page, NESTED, picked);
    back.forEach((r, i) => expect(Math.abs(r.x - before[i].x)).toBeLessThanOrEqual(0.01));
  }
  // fewer than two nodes: disabled
  await select(page, NESTED, [texts[1]]);
  expect(await page.evaluate(() => window.__appIconic!.run('arrange.align.left'))).toBe(false);
  expect(errors).toEqual([]);
});

test('drag & drop with the mouse: groups, a node into a container, never into itself', async ({
  page,
}) => {
  await openIcon(page);
  expect(await groupNames(page)).toEqual(['logo-scanner 3', 'logo-scanner-2 2']);
  const assetsInCanvas = () =>
    page
      .locator('app-canvas-view .layer')
      .evaluateAll((ls) => ls.map((l) => (l as HTMLElement).dataset['asset']));
  // paint order: last group first (bottom)
  expect(await assetsInCanvas()).toEqual(['logo-scanner-2 2.svg', 'logo-scanner 3.svg']);
  await dragRow(page, 'g1', 'g0', 0.1);
  await expect.poll(() => groupNames(page)).toEqual(['logo-scanner-2 2', 'logo-scanner 3']);
  // the canvas follows at once
  await expect.poll(assetsInCanvas).toEqual(['logo-scanner 3.svg', 'logo-scanner-2 2.svg']);
  await expect(page.getByRole('button', { name: 'Undo Reorder Node' })).toBeEnabled();
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await expect.poll(() => groupNames(page)).toEqual(['logo-scanner 3', 'logo-scanner-2 2']);

  // nodes: an SVG with a group and a rect; the rect goes into the group
  await importSvg(
    page,
    'dnd.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g id="box"/>' +
      '<rect id="r" width="100" height="100"/><circle id="c" r="10"/></svg>',
  );
  const [g, r] = await ids(page, 'dnd.svg', '#box, #r');
  await dragRow(page, `g0/l0/${r}`, `g0/l0/${g}`, 0.5);
  await expect.poll(() => ids(page, 'dnd.svg', '#box > *')).toEqual([r]);
  // the moved node stays selected and visible in the tree (its parent opened)
  await expect(row(page, `g0/l0/${g}/${r}`)).toHaveAttribute('aria-selected', 'true');
  // a group cannot go into its own child: nothing happens
  const before = await page.evaluate(() => window.__appIconic!.store()!.document().snapshot());
  await dragRow(page, `g0/l0/${g}`, `g0/l0/${g}/${r}`, 0.5);
  expect(await page.evaluate(() => window.__appIconic!.store()!.document().snapshot())).toBe(
    before,
  );
});

test('a node dragged into another image changes the asset and reports broken references', async ({
  page,
}) => {
  await openIcon(page);
  await importSvg(
    page,
    'refs.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>' +
      '<linearGradient id="grad"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/>' +
      '</linearGradient></defs><rect id="painted" width="300" height="300" fill="url(#grad)"/></svg>',
  );
  const [rect] = await ids(page, 'refs.svg', '#painted');
  // the swatch shows the gradient
  await expect(row(page, `g0/l0/${rect}`).locator('.swatch[data-kind="gradient"]')).toHaveCount(1);
  // into the layer of camscanner's first group (now g1/l0)
  await dragRow(page, `g0/l0/${rect}`, 'g1/l0', 0.5);
  await expect(page.getByRole('status')).toContainText('#grad');
  const moved = await page.evaluate(
    (id) =>
      window.__appIconic!.store()!.document().node({ asset: 'logo-scanner 3.svg', id }) !== null,
    rect,
  );
  expect(moved).toBe(true);
});

test('keyboard: arrows, expand/collapse, range, context menu and Delete… with follow-up', async ({
  page,
}) => {
  await openIcon(page, '/fixtures/svg/nested_g.icon');
  await row(page, 'g0/l0').click();
  await expect(row(page, 'g0/l0')).toBeFocused();
  const sel = () =>
    page.evaluate(() => {
      const s = window.__appIconic!.store()!;
      return { nodes: s.selection().map((r) => r.id), items: s.items() };
    });
  expect((await sel()).items).toEqual([{ kind: 'layer', group: 0, layer: 0 }]);
  await page.keyboard.press('ArrowDown');
  const [rect, g1] = await ids(page, NESTED, ':scope > rect, :scope > g');
  expect((await sel()).nodes).toEqual([rect]);
  await page.keyboard.press('ArrowDown');
  expect((await sel()).nodes).toEqual([g1]);
  await expect(row(page, `g0/l0/${g1}`)).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowRight');
  await expect(row(page, `g0/l0/${g1}`)).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowRight'); // to the first child
  await page.keyboard.press('Shift+ArrowDown');
  expect((await sel()).nodes).toHaveLength(2);
  await page.keyboard.press('ArrowLeft'); // to the parent
  expect((await sel()).nodes).toEqual([g1]);
  await page.keyboard.press('ArrowLeft'); // collapse
  await expect(row(page, `g0/l0/${g1}`)).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Home');
  expect((await sel()).items).toEqual([{ kind: 'root' }]);
  await page.keyboard.press('End');
  expect((await sel()).nodes).toEqual([g1]);

  // context menu (Shift+F10) → Delete… asks → the previous sibling is selected
  await page.keyboard.press('Shift+F10');
  const cm = page.getByRole('menu', { name: 'Node actions' });
  await expect(cm.getByRole('menuitem').first()).toBeFocused();
  await expect(cm.getByRole('menuitem', { name: 'Edit SVG…' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await cm.getByRole('menuitem', { name: 'Delete…' }).click();
  const ask = page.getByRole('alertdialog');
  await expect(ask).toContainText('removes the node and its children');
  await ask.getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => ids(page, NESTED, ':scope > g')).toEqual([]);
  expect((await sel()).nodes).toEqual([rect]);
  // Move Up / Down by keyboard (Alt+arrows) – undo brings the group back first
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await row(page, `g0/l0/${rect}`).click();
  await page.keyboard.press('Alt+ArrowDown');
  expect(await ids(page, NESTED, ':scope > *')).toEqual([g1, rect]);
});

test('visibility: eye buttons hide nodes and groups in the canvas at once; Alt = recursive', async ({
  page,
}) => {
  await openIcon(page);
  const [poly] = await ids(page, 'logo-scanner 3.svg', 'polygon');
  await page.evaluate(
    (id) =>
      window.__appIconic!.run('edit.select', { nodes: [{ asset: 'logo-scanner 3.svg', id }] }),
    poly,
  );
  // revealed: the parents opened, the row scrolled into view
  const r = tree(page).locator(`[data-row$="/${poly}"]`);
  await expect(r).toBeVisible();
  const polygon = page.locator(`app-canvas-view .layer [data-ai-id="${poly}"]`);
  await expect(polygon).toBeVisible();
  await r.hover();
  await r.locator('.eye').click();
  await expect(polygon).toBeHidden();
  await expect(polygon).toHaveAttribute('display', 'none');
  await r.locator('.eye').click();
  await expect(polygon).toBeVisible();

  // a group: its layers leave the canvas
  await expect(page.locator('app-canvas-view .layer')).toHaveCount(2);
  await row(page, 'g1').hover();
  await row(page, 'g1')
    .locator('.eye')
    .click({ modifiers: ['Alt'] });
  await expect(page.locator('app-canvas-view .layer')).toHaveCount(1);
  const hidden = await page.evaluate(() => {
    const g = window.__appIconic!.store()!.document().iconJson.groups![1];
    return [g['hidden'], g.layers![0]['hidden']];
  });
  expect(hidden).toEqual([true, true]);
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await expect(page.locator('app-canvas-view .layer')).toHaveCount(2);
});

test('copy and paste SVG markup between two documents (clipboard)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openIcon(page, '/fixtures/svg/nested_g.icon');
  const [rect] = await ids(page, NESTED, ':scope > rect');
  await row(page, `g0/l0/${rect}`).click();
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('<rect');

  const other = await context.newPage();
  await openIcon(other, '/fixtures/svg/some_pathes.icon');
  await row(other, 'g0/l0').click();
  const count = () => ids(other, 'some_pathes.svg', ':scope > rect');
  expect(await count()).toEqual([]);
  await other.keyboard.press('Control+v');
  await expect.poll(count).toHaveLength(1);
  // pasted node is selected, has a fresh internal id and no internal attributes in the file
  const text = await other.evaluate(() => window.__appIconic!.assetText('some_pathes.svg'));
  expect(text).toContain('<rect');
  expect(text).not.toContain('data-ai-');
  expect(text).not.toMatch(/<rect[^>]*xmlns=/);
  // nothing selected: a whole SVG becomes a new group on top
  await other.evaluate(() => window.__appIconic!.run('edit.deselect'));
  await other.evaluate(() =>
    window.__appIconic!.run('edit.paste', {
      text: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5" onclick="x()"/></svg>',
    }),
  );
  await expect(row(other, 'g0/l0')).toContainText('Pasted');
  const pasted = await other.evaluate(() => window.__appIconic!.assetText('Pasted.svg'));
  expect(pasted).toContain('<circle');
  expect(pasted).not.toContain('onclick');
  await menu(other, 'Edit', 'Undo Paste');
  await expect(row(other, 'g0/l0')).not.toContainText('Pasted');
});
