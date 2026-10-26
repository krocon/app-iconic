import { expect, Page, test } from '@playwright/test';
import { collectErrors } from './canvas-helpers';
import {
  centerOn,
  close,
  docOf,
  drag,
  handles,
  idOf,
  insert,
  openFixture,
  screenOf,
  select,
  snapping,
  view,
} from './selection-helpers';

/**
 * Prompt 007 – selection, handles, snapping with real layout (Chromium, browser mode): handles sit
 * exactly where the browser's screen CTM puts the points, also in nested transformed groups
 * (translate / scale / rotate / skew / matrix) at 50 / 100 / 150 % and after a pan; dragging is
 * exact in document space; Magic Snap at 19 but not 21 screen px; Escape restores; a gesture is
 * one undo step.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const SMALL = 'nested_g_small.svg';
const NESTED = 'nested_g.svg';
const VIEWS: [number, number, number][] = [
  [0.5, 40, 30],
  [1, -120, 10],
  [1.5, -500, -380],
];

/** The four corners of a rect in its user space. */
async function corners(page: Page, asset: string, id: string) {
  const [x, y, w, h] = await page.evaluate(
    ([asset, id]) => {
      const el = window.__appIconic!.store()!.document().node({ asset, id }) as SVGRectElement;
      return [
        el.x.baseVal.value,
        el.y.baseVal.value,
        el.width.baseVal.value,
        el.height.baseVal.value,
      ];
    },
    [asset, id],
  );
  return {
    move: { x, y },
    'rectCorner:tr': { x: x + w, y },
    'rectCorner:bl': { x, y: y + h },
    'rectCorner:br': { x: x + w, y: y + h },
  };
}

async function expectRectHandles(page: Page, asset: string, id: string) {
  await select(page, asset, [id]);
  const shown = await handles(page);
  for (const [role, local] of Object.entries(await corners(page, asset, id))) {
    const want = await screenOf(page, asset, id, local);
    const got = shown[`0:${role}`];
    expect(got, `${id} ${role}`).toBeDefined();
    close(got, want);
  }
}

/**
 * Inserts rects into the first rotated group of nested_g.svg (19 levels deep: translate, scale,
 * matrix, rotate) and a skewed group in it – inside the canvas, so the BoundsGuard stays out.
 */
async function deepRects(page: Page): Promise<string[]> {
  const deepest = await page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('nested_g.svg')!.svg!.root;
    const gs = [...root.querySelectorAll('g')];
    return gs
      .find((g) => g.getAttribute('transform')!.startsWith('rotate'))!
      .getAttribute('data-ai-id')!;
  });
  await insert(
    page,
    NESTED,
    deepest,
    '<rect id="deep" x="10" y="-30" width="40" height="25" fill="#0f0"/>',
  );
  await insert(
    page,
    NESTED,
    deepest,
    '<g id="sk" transform="skewX(25) matrix(0.9 0.2 -0.1 1.1 5 -8)">' +
      '<rect id="skew" x="-20" y="10" width="30" height="20" transform="rotate(20 10 10)" fill="#ff0"/></g>',
  );
  return [await idOf(page, NESTED, '#deep'), await idOf(page, NESTED, '#skew')];
}

for (const [zoom, panX, panY] of VIEWS) {
  test(`handles sit on the CTM position of their points at ${zoom * 100} % (pan ${panX}, ${panY})`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await openFixture(page, SMALL);
    await view(page, zoom, panX, panY);
    for (const sel of ['#r_1_1', '#r_1_2', '#r_1_3', '#r_1_4', '#r_2_2', '#r_2_4']) {
      await expectRectHandles(page, SMALL, await idOf(page, SMALL, sel));
    }
    await openFixture(page, NESTED);
    await view(page, zoom, panX, panY);
    const [deep, skew] = await deepRects(page);
    await expectRectHandles(page, NESTED, deep);
    await expectRectHandles(page, NESTED, skew);
    // the rotate pivot of the skewed rect: (10, 10) in its parent's space (rotate is first)
    const shown = await handles(page);
    const pivot = Object.entries(shown).find(([k]) => k.endsWith(':pivot'))![1];
    const parent = await idOf(page, NESTED, '#sk');
    close(pivot, await screenOf(page, NESTED, parent, { x: 10, y: 10 }));
    // the frame is the rotated / skewed local bbox: its corners are the corner handles
    const frame = await page.evaluate(() =>
      document
        .querySelector('[data-testid="selection-overlay"] polygon.frame')!
        .getAttribute('points')!
        .split(' ')
        .map((p) => p.split(',').map(Number)),
    );
    close({ x: frame[2][0], y: frame[2][1] }, await viewportOf(page, shown['0:rectCorner:br']));
    expect(errors).toEqual([]);
  });
}

/** Client → viewport-local pixels (the overlay's coordinates). */
async function viewportOf(page: Page, p: { x: number; y: number }) {
  const r = await page.locator('.viewport').boundingBox();
  return { x: p.x - r!.x, y: p.y - r!.y };
}

for (const zoom of [0.5, 1, 1.5]) {
  test(`dragging a handle by (dx, dy) on screen moves its point by (dx, dy) / zoom at ${zoom * 100} %`, async ({
    page,
  }) => {
    await openFixture(page, NESTED);
    await snapping(page, false);
    const [, skew] = await deepRects(page);
    await select(page, NESTED, [skew]);
    const start = await corners(page, NESTED, skew);
    const before = await docOf(page, NESTED, skew, start['rectCorner:br']);
    const fixed = await docOf(page, NESTED, skew, start.move);
    await centerOn(page, zoom, before);
    const h = (await handles(page))['0:rectCorner:br'];
    await drag(page, h, 30, -20);
    // the dragged corner is under the pointer (the rect may have flipped: the nearest corner)
    const want = { x: before.x + 30 / zoom, y: before.y - 20 / zoom };
    const now = await Promise.all(
      Object.values(await corners(page, NESTED, skew)).map((c) => docOf(page, NESTED, skew, c)),
    );
    const nearest = (p: { x: number; y: number }) =>
      [...now].sort(
        (a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
      )[0];
    close(nearest(want), want);
    // the opposite corner stays where it was
    close(nearest(fixed), fixed);
    // one undo step for the whole gesture, as one serialisable command
    const last = await page.evaluate(() => window.__appIconic!.lastCommand());
    expect(last).toMatchObject({ type: 'setAttributes', label: 'adjustPath' });
    await page.evaluate(() => window.__appIconic!.store()!.undo());
    const back = await docOf(
      page,
      NESTED,
      skew,
      (await corners(page, NESTED, skew))['rectCorner:br'],
    );
    close(back, before, 0.01);
    // dragging the shape itself moves the group a click takes (the top one) by (dx, dy) / zoom
    const inside = await screenOf(page, NESTED, skew, { x: -5, y: 20 });
    const b0 = await docOf(page, NESTED, skew, { x: -5, y: 20 });
    await drag(page, inside, -25, 15);
    close(await docOf(page, NESTED, skew, { x: -5, y: 20 }), {
      x: b0.x - 25 / zoom,
      y: b0.y + 15 / zoom,
    });
    expect(await page.evaluate(() => window.__appIconic!.lastCommand())).toMatchObject({
      type: 'setAttributes',
      label: 'moveNode',
    });
  });
}
