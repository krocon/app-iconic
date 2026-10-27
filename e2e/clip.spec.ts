import { expect, Page, test } from '@playwright/test';
import { docPixel, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, close, drag, frames, idOf, select, snapping } from './selection-helpers';

/**
 * Prompt 014 – clip paths on the canvas (Chromium, browser mode): the picture is clipped, a click
 * on the cut-away part hits what lies below, clip shapes are never hit or marquee-selected outside
 * the edit mode, in the mode they are edited with the handles of 007 and the picture follows,
 * geometry through owners with transforms and `objectBoundingBox`.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'clip.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="bg" x="100" y="100" width="824" height="824" fill="#0000ff"/>' +
  '<rect id="top" x="200" y="200" width="600" height="600" fill="#ff0000"/>' +
  '<g id="moved" transform="translate(100 850) scale(2)">' +
  '<rect id="o" x="10" y="10" width="100" height="20" fill="#00ff00"/></g>' +
  '</svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, SVG);
  await snapping(page, false);
  await centerOn(page, 0.75, { x: 512, y: 512 });
}

const run = (page: Page, id: string, args?: unknown) =>
  page.evaluate(([id, args]) => window.__appIconic!.run(id as string, args), [id, args] as const);

/** What a click at the document point hits (`hitTest`): the SVG `id` of the element. */
async function hitAt(page: Page, x: number, y: number): Promise<string | null> {
  const c = await toClient(page, x, y);
  return page.evaluate(
    ([cx, cy]) => {
      const h = window.__appIconic!.hit(cx, cy);
      const doc = window.__appIconic!.store()!.document();
      return h ? (doc.node({ asset: h.asset, id: h.id })?.getAttribute('id') ?? null) : null;
    },
    [c.clientX, c.clientY],
  );
}

const red = (p: number[]) => p[0] > 200 && p[1] < 60 && p[2] < 60;
const blue = (p: number[]) => p[2] > 200 && p[0] < 60;

async function clipTop(page: Page) {
  const node = { asset: A, id: await idOf(page, A, '#top') };
  expect(
    await run(page, 'clip.create', {
      node,
      id: 'half',
      markup: '<rect x="200" y="200" width="300" height="600"/>',
    }),
  ).toBe(true);
  await frames(page);
}

test('a clip cuts the picture; a click on the cut-away part hits the node below', async ({
  page,
}) => {
  await setup(page);
  expect(red(await docPixel(page, 650, 500))).toBe(true);
  expect(await hitAt(page, 650, 500)).toBe('top');
  await clipTop(page);
  expect(red(await docPixel(page, 300, 500))).toBe(true);
  expect(blue(await docPixel(page, 650, 500))).toBe(true);
  expect(await hitAt(page, 300, 500)).toBe('top');
  expect(await hitAt(page, 650, 500)).toBe('bg');
  // the clip shape itself is never hit outside the edit mode
  expect(await hitAt(page, 210, 210)).toBe('top');
});

test('clip shapes are not selected by the marquee outside the edit mode', async ({ page }) => {
  await setup(page);
  await clipTop(page);
  await centerOn(page, 0.5, { x: 512, y: 512 });
  const a = await toClient(page, 30, 30);
  const b = await toClient(page, 1000, 1000);
  await drag(page, { x: a.clientX, y: a.clientY }, b.clientX - a.clientX, b.clientY - a.clientY);
  const ids = await page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    return s.selection().map((r) => s.document().node(r)?.getAttribute('id') ?? r.id);
  });
  expect(ids.sort()).toEqual(['bg', 'moved', 'top']);
});

test('edit mode: drag the clip shape, the visible part follows; Esc ends it', async ({ page }) => {
  await setup(page);
  await clipTop(page);
  await select(page, A, [await idOf(page, A, '#top')]);
  expect(await run(page, 'clip.edit')).toBe(true);
  await frames(page, 3);
  await expect(page.getByTestId('clip-banner')).toContainText('Editing clip path #half');
  await expect(page.getByTestId('clip-edit-shapes').locator('rect')).toHaveCount(1);
  // the frame of the selected clip shape lies on the clip rectangle (handles of 007)
  const frame = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="selection-overlay"] .frame')!;
    const r = p.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const tl = await toClient(page, 200, 200);
  const br = await toClient(page, 500, 800);
  close({ x: frame.x, y: frame.y }, { x: tl.clientX, y: tl.clientY }, 1.5);
  close({ x: frame.x + frame.w, y: frame.y + frame.h }, { x: br.clientX, y: br.clientY }, 1.5);
  // a click hits the clip shape now (and not the node below)
  const c = await toClient(page, 350, 500);
  const to = await toClient(page, 650, 500);
  await drag(page, { x: c.clientX, y: c.clientY }, to.clientX - c.clientX, 0);
  const t = await page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('clip.svg')!.svg!.root;
    return root.querySelector('#half rect')!.getAttribute('transform');
  });
  expect(t).toBe('translate(300 0)');
  await page.locator('.viewport').focus();
  await page.keyboard.press('Escape');
  await frames(page);
  await expect(page.getByTestId('clip-banner')).toHaveCount(0);
  await expect(page.getByTestId('clip-edit-shapes')).toHaveCount(0);
  expect(await hitAt(page, 650, 500)).toBe('top');
  expect(await hitAt(page, 300, 500)).toBe('bg');
  expect(red(await docPixel(page, 650, 500))).toBe(true);
  expect(blue(await docPixel(page, 300, 500))).toBe(true);
  // one undo step brings the old cut back
  await run(page, 'edit.undo');
  await frames(page);
  expect(await hitAt(page, 300, 500)).toBe('top');
});

test('bounding box units and an owner with a transform: shapes map like the picture', async ({
  page,
}) => {
  await setup(page);
  const node = { asset: A, id: await idOf(page, A, '#o') };
  expect(
    await run(page, 'clip.create', {
      node,
      id: 'obb',
      markup: '<rect x="0" y="0" width="0.5" height="1"/>',
    }),
  ).toBe(true);
  expect(await run(page, 'clip.edit', { clip: 'obb', asset: A })).toBe(true);
  // the clip is in user space here (the default) – switch to bounding box units, picture stays
  expect(
    await run(page, 'clip.setUnits', { units: 'objectBoundingBox', clip: 'obb', asset: A }),
  ).toBe(true);
  await frames(page, 3);
  const shape = await idOf(page, A, '#obb rect');
  const bounds = await page.evaluate((id) => window.__appIconic!.nodeBounds('clip.svg', id), shape);
  // user space 0 … 0.5 of the rect itself → 100 + 2·(0 … 0.5), 850 + 2·(0 … 1): stays tiny
  expect(bounds!.x).toBeCloseTo(100, 3);
  expect(bounds!.y).toBeCloseTo(850, 3);
  expect(bounds!.width).toBeCloseTo(1, 3);
  await run(page, 'clip.done');
  // now cut half of the green rect with real bounding box geometry
  await run(page, 'edit.runCommand', {
    command: {
      type: 'setAttributes',
      changes: [
        { ref: { asset: A, id: await idOf(page, A, '#obb') }, name: 'transform', value: null },
      ],
    },
  });
  await frames(page);
  // rect o: x 10 … 110, y 10 … 30 in the group → document x 120 … 320, y 870 … 910
  expect((await docPixel(page, 170, 890))[1]).toBeGreaterThan(200);
  expect((await docPixel(page, 280, 890))[1]).toBeLessThan(60);
  expect(await hitAt(page, 170, 890)).toBe('o');
  expect(await hitAt(page, 280, 890)).toBe('bg');
  await run(page, 'clip.edit', { clip: 'obb', asset: A });
  await frames(page, 3);
  const b2 = await page.evaluate((id) => window.__appIconic!.nodeBounds('clip.svg', id), shape);
  expect(b2!.x).toBeCloseTo(120, 3);
  expect(b2!.y).toBeCloseTo(870, 3);
  expect(b2!.width).toBeCloseTo(100, 3);
  expect(b2!.height).toBeCloseTo(40, 3);
  // Add in the mode goes into the clip, document sized through a transform (design 014 E7)
  expect(await run(page, 'add.rect')).toBe(true);
  await frames(page);
  const added = await page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    const ref = s.selection()[0];
    const el = s.document().node(ref)!;
    return {
      parent: el.parentElement!.id,
      bounds: window.__appIconic!.nodeBounds(ref.asset, ref.id),
    };
  });
  expect(added.parent).toBe('obb');
  expect(added.bounds!.width).toBeCloseTo(256, 2);
  expect(added.bounds!.height).toBeCloseTo(256, 2);
});

test('the properties section: create for the layer, pick none for a node', async ({ page }) => {
  await setup(page);
  await page.locator('[role="treeitem"][data-kind="layer"]', { hasText: 'clip' }).click();
  await expect(page.getByTestId('clip-section')).toBeVisible();
  await page.getByTestId('clip-create').click();
  await frames(page);
  await expect(page.getByRole('tree')).toContainText('Layer Clip · 3');
  // a click on the canvas selects the node, not the clip group around it
  const c = await toClient(page, 650, 500);
  await page.mouse.click(c.clientX, c.clientY);
  await frames(page);
  const picked = await page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    return s.selection().map((r) => s.document().node(r)?.getAttribute('id'));
  });
  expect(picked).toEqual(['top']);
  await select(page, A, [await idOf(page, A, '#top')]);
  const picker = page.getByTestId('clip-picker');
  await expect(picker).toHaveValue('inherit');
  await picker.selectOption('none');
  await frames(page);
  const text = await page.evaluate(() => window.__appIconic!.assetText('clip.svg'));
  expect(text).toMatch(/<g clip-path="url\(#clip\)"><rect id="bg"[^>]*\/><\/g><rect id="top"/);
  await expect(picker).toHaveValue('none');
  // the layer clip covers the canvas: in the mode it may leave it (no BoundsGuard for clips)
  await select(page, A, [await idOf(page, A, '#bg')]);
  expect(await run(page, 'clip.edit')).toBe(true);
  await frames(page);
  expect(await run(page, 'arrange.moveBy', { dx: 600, dy: 0 })).toBe(true);
  const moved = await page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('clip.svg')!.svg!.root;
    return root.querySelector('#clip rect')!.getAttribute('transform');
  });
  expect(moved).toBe('translate(600 0)');
});
