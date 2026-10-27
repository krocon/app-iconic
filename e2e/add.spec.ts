import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { menu } from './menu-helpers';
import { centerOn, close, frames, idOf, select } from './selection-helpers';

/**
 * Prompt 008 – adding elements (Chromium, browser mode with fakes): the command sidebar and the
 * Add menu put new elements centred in the visible part of the canvas – also inside a rotated,
 * scaled group (inverse CTM) –, as one undo step, selected afterwards.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'add.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<g id="rg" transform="translate(300 200) rotate(30) scale(1.5)">' +
  '<rect id="inner" x="0" y="0" width="40" height="40" fill="#f00"/></g></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, SVG);
}

/** Document point in the middle of the viewport (from the view transform). */
function visibleCenter(page: Page) {
  return page.evaluate(() => {
    const c = window.__appIconic!.canvas;
    const vp = c.viewport();
    return c.toDocument({ x: vp.width / 2, y: vp.height / 2 });
  });
}

/** The first selected node: its ref, tag, parent id and bounds centre in document units. */
function selectedNode(page: Page) {
  return page.evaluate(() => {
    const h = window.__appIconic!;
    const s = h.store()!;
    const ref = s.selection()[0];
    if (!ref) return null;
    const el = s.document().node(ref)!;
    const b = h.nodeBounds(ref.asset, ref.id);
    return {
      ref,
      tag: el.localName,
      parent: el.parentElement?.getAttribute('data-ai-id') ?? null,
      center: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null,
    };
  });
}

function sidebarItem(page: Page, id: string) {
  return page.locator(`app-command-sidebar [data-action="${id}"]`);
}

test('a rectangle goes into a rotated group, centred in the visible area; undo removes it', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  const rg = await idOf(page, A, '#rg');
  for (const [zoom, p] of [
    [1.5, { x: 400, y: 600 }],
    [0.5, { x: 512, y: 512 }],
  ] as const) {
    await centerOn(page, zoom, p);
    await select(page, A, [rg]);
    const before = await page.evaluate(() => window.__appIconic!.store()!.document().snapshot());
    await sidebarItem(page, 'add.rect').click();
    await frames(page);
    const n = (await selectedNode(page))!;
    expect(n.tag).toBe('rect');
    expect(n.parent).toBe(rg);
    close(n.center!, await visibleCenter(page));
    // the local size stays 256 (the group scales it on screen)
    expect(
      await page.evaluate(
        (r) => window.__appIconic!.store()!.document().node(r)!.getAttribute('width'),
        n.ref,
      ),
    ).toBe('256');
    expect(await page.evaluate(() => window.__appIconic!.lastCommand())).toMatchObject({
      type: 'composite',
      label: 'addRect',
    });
    // the canvas has the focus after a click in the sidebar: Ctrl+Z undoes
    await page.keyboard.press('Control+z');
    await frames(page);
    expect(await page.evaluate(() => window.__appIconic!.store()!.document().snapshot())).toBe(
      before,
    );
  }
  expect(errors).toEqual([]);
});

test('Group (SVG) adds group, layer and asset; the next shape lands in it', async ({ page }) => {
  await setup(page);
  const groupsBefore = await page.evaluate(
    () => window.__appIconic!.store()!.document().iconJson.groups!.length,
  );
  await menu(page, 'Add', 'Group (SVG)');
  const state = await page.evaluate(() => {
    const d = window.__appIconic!.store()!.document();
    return {
      groups: d.iconJson.groups!.length,
      second: d.iconJson.groups![1].layers,
      assets: [...d.assets.keys()],
      items: window.__appIconic!.store()!.items(),
    };
  });
  expect(state.groups).toBe(groupsBefore + 1);
  // behind the group of the current layer (the imported one is on top, index 0)
  const name = `layer-${groupsBefore + 1}`;
  expect(state.second).toEqual([{ 'image-name': `${name}.svg`, name }]);
  expect(state.assets).toContain(`${name}.svg`);
  expect(state.items).toEqual([{ kind: 'layer', group: 1, layer: 0 }]);
  await expect(page.getByRole('tree')).toContainText(name);
  await sidebarItem(page, 'add.circle').click();
  await frames(page);
  const n = (await selectedNode(page))!;
  expect(n.ref.asset).toBe(`${name}.svg`);
  close(n.center!, await visibleCenter(page));
  // one step each
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect(
    await page.evaluate(() => window.__appIconic!.store()!.document().iconJson.groups!.length),
  ).toBe(groupsBefore);
});

test('SVG Snippet: live error, then centred on its bounds', async ({ page }) => {
  await setup(page);
  await centerOn(page, 1, { x: 300, y: 700 });
  await menu(page, 'Add', 'SVG Snippet…');
  const dialog = page.getByRole('dialog', { name: 'SVG Snippet' });
  await expect(dialog).toBeVisible();
  const area = dialog.getByTestId('snippet-markup');
  await area.fill('<rect');
  await expect(dialog.getByRole('alert')).toContainText('not valid');
  await expect(dialog.getByTestId('snippet-add')).toBeDisabled();
  await area.fill(
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs>' +
      '<rect x="0" y="0" width="100" height="40" fill="#0a0" onclick="alert(1)"/>' +
      '<circle cx="200" cy="20" r="20"/></svg>',
  );
  await dialog.getByTestId('snippet-add').click();
  await expect(dialog).toBeHidden();
  await frames(page);
  const union = await page.evaluate(() => {
    const h = window.__appIconic!;
    const refs = h.store()!.selection();
    const bs = refs.map((r) => h.nodeBounds(r.asset, r.id)!);
    const x0 = Math.min(...bs.map((b) => b.x));
    const x1 = Math.max(...bs.map((b) => b.x + b.width));
    const y0 = Math.min(...bs.map((b) => b.y));
    const y1 = Math.max(...bs.map((b) => b.y + b.height));
    return { n: refs.length, center: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } };
  });
  expect(union.n).toBe(2);
  close(union.center, await visibleCenter(page));
  expect(await page.evaluate((a) => window.__appIconic!.assetText(a), A)).not.toContain('onclick');
});

test('Image (Ctrl+I) through the file dialog: fitted to 512, centred', async ({ page }) => {
  await setup(page);
  await centerOn(page, 1, { x: 512, y: 512 });
  await page.evaluate(() => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1000"><rect width="2000" height="1000" fill="#36f"/></svg>';
    const h = window.__appIconic!;
    h.files.imageFiles.set('/img/wide.svg', {
      name: 'wide.svg',
      mime: 'image/svg+xml',
      dataUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
      width: null,
      height: null,
    });
    h.pick('/img/wide.svg');
  });
  await page.locator('app-canvas-view .viewport').focus();
  await page.keyboard.press('Control+i');
  await expect.poll(async () => (await selectedNode(page))?.tag).toBe('image');
  const n = (await selectedNode(page))!;
  const size = await page.evaluate((r) => {
    const el = window.__appIconic!.store()!.document().node(r)!;
    return [el.getAttribute('width'), el.getAttribute('height')];
  }, n.ref);
  expect(size).toEqual(['512', '256']);
  close(n.center!, { x: 512, y: 512 });
});

test('sidebar: filter + Enter, later tools disabled, Add menu enabled', async ({ page }) => {
  await setup(page);
  const filter = page.getByTestId('command-filter');
  await filter.fill('ellip');
  await expect(page.locator('app-command-sidebar [role="option"]')).toHaveCount(1);
  await filter.press('Enter');
  await expect.poll(async () => (await selectedNode(page))?.tag).toBe('ellipse');
  await filter.fill('');
  await expect(sidebarItem(page, 'add.freehand')).toHaveAttribute('aria-disabled', 'true');
  await expect(sidebarItem(page, 'add.symbol')).toHaveAttribute('aria-disabled', 'true');
  const info = await page.evaluate(() =>
    window
      .__appIconic!.actions()
      .filter((a) => a.group === 'add')
      .map((a) => [a.id, a.enabled]),
  );
  expect(Object.fromEntries(info)).toMatchObject({
    'add.circle': true,
    'add.iconGroup': true,
    'add.image': true,
    'add.svgSnippet': true,
    'add.freehand': false,
    'add.textToPath': false,
    'add.symbol': false,
  });
  // the AI path: an action with arguments
  const ok = await page.evaluate(() =>
    window.__appIconic!.run('add.circle', { cx: 100, cy: 100, r: 10, fill: '#ff0000' }),
  );
  expect(ok).toBe(true);
  await expect.poll(async () => (await selectedNode(page))?.tag).toBe('circle');
});
