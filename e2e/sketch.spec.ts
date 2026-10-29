import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, idOf, select, snapping } from './selection-helpers';

/**
 * Prompt 019 – sketch tools like Fusion (Chromium, browser mode): shapes drawn with clicks and
 * typed dimensions are exact at zoom 50/100/150 % and in transformed groups; tangent circles touch
 * their targets; the tangent arc continues a line; new shapes take the style of their kind.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'sketch.svg';
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body = '<rect id="bg" x="0" y="0" width="4" height="4"/>') {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, svg(body));
  await snapping(page, false);
}

async function tool(page: Page, id: string) {
  expect(await page.evaluate((id) => window.__appIconic!.run(id), id)).toBe(true);
  await frames(page);
}

async function click(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 2 });
  await page.mouse.down();
  await page.mouse.up();
  await frames(page);
}

async function hover(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 2 });
  await frames(page);
}

/** The selected element: tag and attributes. */
function selected(page: Page) {
  return page.evaluate(() => {
    const h = window.__appIconic!;
    const ref = h.store()!.selection()[0];
    const el = ref ? h.store()!.document().node(ref) : null;
    if (!el) return null;
    return {
      ref,
      tag: el.localName,
      attrs: Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])),
    };
  });
}

const num = (s: string | undefined) => Number(s);

/** Corners of a `<rect>` with an optional `rotate(a cx cy)`. */
function rectCorners(a: Record<string, string>) {
  const x = num(a['x']);
  const y = num(a['y']);
  const w = num(a['width']);
  const h = num(a['height']);
  const m = /rotate\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)/.exec(a['transform'] ?? '');
  const [deg, cx, cy] = m ? [num(m[1]), num(m[2]), num(m[3])] : [0, 0, 0];
  const r = (deg * Math.PI) / 180;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ].map(([px, py]) => ({
    x: cx + (px - cx) * Math.cos(r) - (py - cy) * Math.sin(r),
    y: cy + (px - cx) * Math.sin(r) + (py - cy) * Math.cos(r),
  }));
}

const near = (p: { x: number; y: number }, x: number, y: number, tol = 0.01) =>
  Math.abs(p.x - x) <= tol && Math.abs(p.y - y) <= tol;

test('2-point rectangle with the mouse: a thin line, one undo step, then selection again', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  await tool(page, 'sketch.rect2p');
  await expect(page.getByTestId('sketch-hint')).toContainText('click a corner');
  await click(page, 200, 200);
  await expect(page.getByTestId('sketch-fields')).toBeVisible();
  await expect(page.getByTestId('sketch-shape')).toHaveCount(1);
  await click(page, 400, 300);
  const s = await selected(page);
  expect(s?.tag).toBe('rect');
  expect(Number(s!.attrs['x'])).toBeCloseTo(200, 1);
  expect(Number(s!.attrs['width'])).toBeCloseTo(200, 1);
  expect(Number(s!.attrs['height'])).toBeCloseTo(100, 1);
  expect(s!.attrs).toMatchObject({ fill: 'none', stroke: '#000000', 'stroke-width': '1' });
  // the tool ends with the shape: the new (unfilled) rectangle can be dragged from inside at once
  await expect(page.getByTestId('sketch-hint')).toHaveCount(0);
  const from = await toClient(page, 300, 250);
  await page.mouse.move(from.clientX, from.clientY);
  await page.mouse.down();
  await page.mouse.move(from.clientX + 40, from.clientY + 30, { steps: 5 });
  await page.mouse.up();
  await frames(page);
  const moved = await selected(page);
  expect(moved?.ref).toEqual(s!.ref);
  expect(moved!.attrs['transform']).toMatch(/^translate\(/);
  await page.evaluate(() => window.__appIconic!.store()!.undo()); // the move
  await page.evaluate(() => window.__appIconic!.store()!.undo()); // the rectangle
  expect(
    await page.evaluate((r) => !!window.__appIconic!.store()!.document().node(r), s!.ref),
  ).toBe(false);
  // Esc drops a started shape, a second Esc ends the tool
  await tool(page, 'sketch.rect2p');
  await click(page, 600, 600);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sketch-hint')).toContainText('click a corner');
  await page.locator('.viewport').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sketch-hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const zoom of [0.5, 1, 1.5]) {
  test(`3-point rectangle 200 × 100 at 30° typed (zoom ${zoom * 100} %)`, async ({ page }) => {
    await setup(page);
    await centerOn(page, zoom, { x: 360, y: 440 });
    await tool(page, 'sketch.rect3p');
    await click(page, 300, 500);
    await page.keyboard.type('200');
    await page.keyboard.press('Tab');
    await page.keyboard.type('30');
    await page.keyboard.press('Enter');
    await hover(page, 270, 420);
    await expect(page.locator('[data-field="height"]')).toBeFocused();
    await page.keyboard.type('100');
    await page.keyboard.press('Enter');
    const s = await selected(page);
    expect(s?.tag).toBe('rect');
    const corners = rectCorners(s!.attrs);
    const ex = 300 + 200 * Math.cos(Math.PI / 6);
    const ey = 500 - 200 * Math.sin(Math.PI / 6);
    expect(
      corners.some((c) => near(c, 300, 500)),
      JSON.stringify(corners),
    ).toBe(true);
    expect(
      corners.some((c) => near(c, ex, ey)),
      JSON.stringify(corners),
    ).toBe(true);
    expect(Number(s!.attrs['width'])).toBeCloseTo(200, 3);
    expect(Number(s!.attrs['height'])).toBeCloseTo(100, 3);
  });
}

test('centre diameter circle inside a rotated, scaled group', async ({ page }) => {
  await setup(
    page,
    '<g id="grp" transform="rotate(30 512 512) scale(2)"><rect x="0" y="0" width="5" height="5"/></g>',
  );
  await select(page, A, [await idOf(page, A, '#grp')]);
  await tool(page, 'sketch.circleCenter');
  await click(page, 512, 400);
  await page.keyboard.type('100');
  await page.keyboard.press('Enter');
  const s = await selected(page);
  expect(s?.tag).toBe('circle');
  expect(Number(s!.attrs['r'])).toBeCloseTo(25, 3); // 50 document units in a group scaled by 2
  const b = await page.evaluate((r) => window.__appIconic!.nodeBounds(r.asset, r.id), s!.ref);
  expect(b!.x + b!.width / 2).toBeCloseTo(512, 1);
  expect(b!.y + b!.height / 2).toBeCloseTo(400, 1);
});

test('3-tangent circle in a triangle is its incircle', async ({ page }) => {
  await setup(
    page,
    '<polygon id="tri" points="100,700 500,700 100,400" fill="none" stroke="#000"/>',
  );
  await tool(page, 'sketch.circle3t');
  await click(page, 300, 700); // bottom edge
  await click(page, 300, 550); // hypotenuse
  await hover(page, 100, 600);
  await expect(page.getByTestId('sketch-preview').locator('.hover')).toHaveCount(1);
  await click(page, 100, 600); // left edge
  await click(page, 190, 610); // choose the circle inside
  const s = await selected(page);
  expect(s?.tag).toBe('circle');
  expect(Number(s!.attrs['cx'])).toBeCloseTo(200, 3);
  expect(Number(s!.attrs['cy'])).toBeCloseTo(600, 3);
  expect(Number(s!.attrs['r'])).toBeCloseTo(100, 3);
});

test('2-tangent circle with a typed diameter touches a line and a circle', async ({ page }) => {
  await setup(
    page,
    '<line id="l" x1="100" y1="800" x2="900" y2="800" stroke="#000"/>' +
      '<circle id="c" cx="500" cy="500" r="100" fill="none" stroke="#000"/>',
  );
  await tool(page, 'sketch.circle2t');
  await click(page, 300, 800);
  await click(page, 500, 600);
  await hover(page, 420, 700);
  await page.keyboard.type('240');
  await page.keyboard.press('Enter');
  const s = await selected(page);
  expect(s?.tag).toBe('circle');
  const cx = Number(s!.attrs['cx']);
  const cy = Number(s!.attrs['cy']);
  // r 120: 120 above the line, 100 + 120 from the circle's centre; the solution left of it
  expect(Number(s!.attrs['r'])).toBeCloseTo(120, 3);
  expect(800 - cy).toBeCloseTo(120, 3);
  expect(Math.hypot(cx - 500, cy - 500)).toBeCloseTo(220, 3);
  expect(cx).toBeLessThan(500);
});

test('tangent arc continues the end of a line', async ({ page }) => {
  await setup(page, '<line id="l" x1="100" y1="300" x2="300" y2="300" stroke="#000"/>');
  await tool(page, 'sketch.arcTangent');
  await click(page, 302, 301);
  await click(page, 400, 400);
  const s = await selected(page);
  expect(s?.tag).toBe('path');
  expect(s!.attrs['d']).toBe('M 300 300 A 100 100 0 0 1 400 400');
});

test('new shapes take the style of the last shape of their kind', async ({ page }) => {
  await setup(page);
  await tool(page, 'sketch.rect2p');
  await click(page, 100, 100);
  await click(page, 200, 200);
  expect(
    await page.evaluate(() =>
      window.__appIconic!.run('properties.set', { name: 'stroke', value: '#ff0000' }),
    ),
  ).toBe(true);
  await tool(page, 'sketch.rect2p');
  await click(page, 300, 300);
  await click(page, 400, 400);
  expect((await selected(page))!.attrs['stroke']).toBe('#ff0000');
  await tool(page, 'sketch.circleCenter');
  await click(page, 600, 600);
  await click(page, 650, 600);
  expect((await selected(page))!.attrs['stroke']).toBe('#000000');
});

/** Corners of a `<polygon points>`. */
const polygonPoints = (a: Record<string, string>) =>
  a['points'].split(' ').map((s) => {
    const [x, y] = s.split(',').map(Number);
    return { x, y };
  });

for (const zoom of [0.5, 1.5]) {
  test(`inscribed polygon: 5 sides, diameter 200 at 90° typed (zoom ${zoom * 100} %)`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page);
    await centerOn(page, zoom, { x: 500, y: 500 });
    await tool(page, 'sketch.polygonInscribed');
    await click(page, 500, 500);
    // like Fusion: the number of sides has the focus, 6 at first
    await expect(page.locator('[data-field="sides"]')).toBeFocused();
    await expect(page.locator('[data-field="sides"]')).toHaveValue('6');
    await page.keyboard.type('5');
    await page.keyboard.press('Tab');
    await page.keyboard.type('200');
    await page.keyboard.press('Tab');
    await page.keyboard.type('90');
    await expect(page.getByTestId('sketch-shape')).toHaveCount(1);
    await page.keyboard.press('Enter');
    const s = await selected(page);
    expect(s?.tag).toBe('polygon');
    const ps = polygonPoints(s!.attrs);
    expect(ps).toHaveLength(5);
    expect(near(ps[0], 500, 400), JSON.stringify(ps)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('edge polygon with the mouse: the third click picks the side; sides stay', async ({
  page,
}) => {
  await setup(page);
  await tool(page, 'sketch.polygonEdge');
  await click(page, 300, 300);
  await page.keyboard.type('4');
  await click(page, 400, 300);
  await expect(page.locator('[data-field="sides"]')).toHaveCount(0);
  await click(page, 350, 250);
  const s = await selected(page);
  expect(s?.tag).toBe('polygon');
  const ps = polygonPoints(s!.attrs);
  expect(ps).toHaveLength(4);
  for (const [x, y] of [
    [300, 300],
    [400, 300],
    [400, 200],
    [300, 200],
  ]) {
    expect(
      ps.some((p) => near(p, x, y)),
      JSON.stringify(ps),
    ).toBe(true);
  }
  // the next polygon starts with 4 sides
  await tool(page, 'sketch.polygonCircumscribed');
  await click(page, 600, 600);
  await expect(page.locator('[data-field="sides"]')).toHaveValue('4');
});

for (const zoom of [0.5, 1.5]) {
  test(`align: a drawn point lines up with the corners of other shapes (zoom ${zoom * 100} %)`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page, '<rect id="r" x="300" y="500" width="150" height="150"/>');
    await snapping(page, true);
    await centerOn(page, zoom, { x: 400, y: 400 });
    await tool(page, 'sketch.line');
    await click(page, 250, 250);
    // 3 screen px off the x of the rectangle's right edge: it lines up ("align") with a guide
    await hover(page, 450 + 3 / zoom, 330);
    const guides = page.getByTestId('align-guides');
    await expect(guides).toBeVisible();
    await expect(guides).toContainText('align');
    await expect(guides.locator('line')).toHaveCount(1);
    await page.mouse.down();
    await page.mouse.up();
    await frames(page);
    const s = await selected(page);
    expect(s?.tag).toBe('line');
    expect(Number(s!.attrs['x2'])).toBeCloseTo(450, 6);
    expect(Number(s!.attrs['y2'])).toBeCloseTo(330, 0);
    await expect(guides).toHaveCount(0);
    // x like one corner, y like the first point: two guides
    await tool(page, 'sketch.line');
    await click(page, 250, 250);
    await hover(page, 300 - 2 / zoom, 380);
    await expect(guides.locator('line')).toHaveCount(1);
    // on the 0° construction guide from the first point, slid into line with the corner
    await hover(page, 300 - 2 / zoom, 250 - 2 / zoom);
    await expect(page.getByTestId('smart-guides').locator('line')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
}

/** Rectangle 300…500 × 300…500 and circle (520, 520) r 100: they cross at (500, 422.02…). */
const CROSS = { x: 500, y: 520 - Math.sqrt(100 * 100 - 20 * 20) };
const SHAPES =
  '<rect x="300" y="300" width="200" height="200" fill="none" stroke="#000"/>' +
  '<circle cx="520" cy="520" r="100" fill="none" stroke="#000"/>';

/** `p` rotated by 30° about (400, 400). */
function rotated(p: { x: number; y: number }) {
  const r = Math.PI / 6;
  const dx = p.x - 400;
  const dy = p.y - 400;
  return {
    x: 400 + dx * Math.cos(r) - dy * Math.sin(r),
    y: 400 + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

for (const c of [
  { name: 'zoom 50 %', zoom: 0.5, body: SHAPES, at: CROSS },
  { name: 'zoom 150 %', zoom: 1.5, body: SHAPES, at: CROSS },
  {
    name: 'in a rotated group',
    zoom: 1,
    body: `<g transform="rotate(30 400 400)">${SHAPES}</g>`,
    at: rotated(CROSS),
  },
]) {
  test(`intersect: a line ends exactly where a rectangle and a circle cross (${c.name})`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page, c.body);
    await snapping(page, true);
    await centerOn(page, c.zoom, { x: 420, y: 420 });
    await tool(page, 'sketch.line');
    await click(page, 330, 260);
    // a few screen pixels beside the crossing
    await hover(page, c.at.x + 4 / c.zoom, c.at.y - 3 / c.zoom);
    await expect(page.getByTestId('snap-label')).toHaveText('intersect');
    await page.mouse.down();
    await page.mouse.up();
    await frames(page);
    const s = await selected(page);
    expect(s?.tag).toBe('line');
    expect(Number(s!.attrs['x2'])).toBeCloseTo(c.at.x, 3);
    expect(Number(s!.attrs['y2'])).toBeCloseTo(c.at.y, 3);
    expect(errors).toEqual([]);
  });
}

test.describe('drag tools like VectorCraft (prompt 041)', () => {
  async function drag(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
    during?: () => Promise<void>,
  ) {
    const a = await toClient(page, from.x, from.y);
    const b = await toClient(page, to.x, to.y);
    await page.mouse.move(a.clientX, a.clientY);
    await page.mouse.down();
    await page.mouse.move(b.clientX, b.clientY, { steps: 6 });
    await during?.();
    await page.mouse.up();
    await frames(page);
  }

  for (const zoom of [0.5, 1.5]) {
    test(`rectangle: a drag; Shift + Alt a square around the start (zoom ${zoom * 100} %)`, async ({
      page,
    }) => {
      const errors = collectErrors(page);
      await setup(page);
      await centerOn(page, zoom, { x: 400, y: 400 });
      await page.locator('.viewport').focus();
      await page.keyboard.press('m');
      await expect(page.getByTestId('sketch-hint')).toContainText('Rectangle');
      await drag(page, { x: 300, y: 300 }, { x: 400, y: 350 });
      let s = await selected(page);
      expect(s?.tag).toBe('rect');
      expect(
        [s!.attrs['x'], s!.attrs['y'], s!.attrs['width'], s!.attrs['height']].map(Number),
      ).toEqual([300, 300, 100, 50]);
      // one shape per tool start: the tool is off again
      await expect(page.getByTestId('sketch-hint')).toHaveCount(0);
      await tool(page, 'sketch.dragRect');
      await page.keyboard.down('Shift');
      await page.keyboard.down('Alt');
      await drag(page, { x: 400, y: 400 }, { x: 460, y: 420 });
      await page.keyboard.up('Alt');
      await page.keyboard.up('Shift');
      s = await selected(page);
      expect(
        [s!.attrs['x'], s!.attrs['y'], s!.attrs['width'], s!.attrs['height']].map(Number),
      ).toEqual([340, 340, 120, 120]);
      expect(errors).toEqual([]);
    });
  }

  test('polygon: ↑ during the drag adds a side; Space moves the shape', async ({ page }) => {
    await setup(page);
    await tool(page, 'sketch.dragPolygon');
    await page.locator('.viewport').focus();
    await drag(page, { x: 400, y: 400 }, { x: 500, y: 400 }, async () => {
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
    });
    let s = await selected(page);
    expect(s?.tag).toBe('polygon');
    expect(s!.attrs['points'].split(' ')).toHaveLength(8);
    // Space held: the polygon follows the pointer instead of growing
    await tool(page, 'sketch.dragPolygon');
    await page.locator('.viewport').focus();
    const a = await toClient(page, 300, 300);
    const b = await toClient(page, 350, 300);
    const c = await toClient(page, 350, 400);
    await page.mouse.move(a.clientX, a.clientY);
    await page.mouse.down();
    await page.mouse.move(b.clientX, b.clientY, { steps: 4 });
    await page.keyboard.down('Space');
    await page.mouse.move(c.clientX, c.clientY, { steps: 4 });
    await page.keyboard.up('Space');
    await page.mouse.up();
    await frames(page);
    s = await selected(page);
    const pts = s!.attrs['points'].split(' ').map((p) => p.split(',').map(Number));
    expect(pts).toHaveLength(8);
    // the centre moved from (300, 300) to (300, 400), the radius stayed 50
    const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length;
    const cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
    expect(cx).toBeCloseTo(300, 1);
    expect(cy).toBeCloseTo(400, 1);
  });

  test('a click without a drag asks for the size', async ({ page }) => {
    await setup(page);
    await tool(page, 'sketch.dragEllipse');
    await click(page, 200, 300);
    const dialog = page.getByRole('dialog', { name: 'Ellipse' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-field="width"]')).toBeFocused();
    await page.keyboard.type('80');
    await page.keyboard.press('Tab');
    await page.keyboard.type('40');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    const s = await selected(page);
    expect(s?.tag).toBe('ellipse');
    expect([s!.attrs['cx'], s!.attrs['cy'], s!.attrs['rx'], s!.attrs['ry']].map(Number)).toEqual([
      240, 320, 40, 20,
    ]);
  });
});

test.describe('Smart Guides (prompt 040)', () => {
  test('a line from a point lands on the tangent of a circle, on a contour, on 45°', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page, '<circle cx="500" cy="300" r="100" fill="none" stroke="#000"/>');
    await snapping(page, true);
    await centerOn(page, 1, { x: 400, y: 350 });
    await tool(page, 'sketch.line');
    await click(page, 200, 300);
    // tangent from (200, 300) to the circle (500, 300) r 100
    const d = 300;
    const ang = Math.acos(100 / d);
    const t = { x: 500 + 100 * Math.cos(Math.PI - ang), y: 300 - 100 * Math.sin(Math.PI - ang) };
    await hover(page, t.x + 3, t.y + 2);
    await expect(page.getByTestId('snap-label')).toHaveText('tangent');
    await page.mouse.down();
    await page.mouse.up();
    await frames(page);
    let s = await selected(page);
    expect(Number(s!.attrs['x2'])).toBeCloseTo(t.x, 3);
    expect(Number(s!.attrs['y2'])).toBeCloseTo(t.y, 3);
    // on the contour, away from the tangents
    await tool(page, 'sketch.line');
    await click(page, 200, 500);
    await hover(page, 553, 389);
    await expect(page.getByTestId('snap-label')).toHaveText('path');
    // a 45° construction guide from the start
    await hover(page, 300, 397);
    await expect(page.getByTestId('smart-guides')).toBeVisible();
    await page.mouse.down();
    await page.mouse.up();
    await frames(page);
    s = await selected(page);
    expect(Number(s!.attrs['x2']) - 200).toBeCloseTo(500 - Number(s!.attrs['y2']), 3);
    expect(errors).toEqual([]);
  });

  test('an ellipse and a line cross exactly ("intersect" on curves)', async ({ page }) => {
    await setup(
      page,
      '<ellipse cx="400" cy="400" rx="200" ry="100" fill="none" stroke="#000"/>' +
        '<line x1="300" y1="200" x2="300" y2="600" stroke="#000"/>',
    );
    await snapping(page, true);
    await centerOn(page, 1, { x: 400, y: 400 });
    await tool(page, 'sketch.line');
    await click(page, 150, 250);
    const y = 400 - 100 * Math.sqrt(1 - (100 * 100) / (200 * 200));
    await hover(page, 303, y + 2);
    await expect(page.getByTestId('snap-label')).toHaveText('intersect');
    await page.mouse.down();
    await page.mouse.up();
    await frames(page);
    const s = await selected(page);
    expect(Number(s!.attrs['x2'])).toBeCloseTo(300, 3);
    expect(Number(s!.attrs['y2'])).toBeCloseTo(y, 3);
  });
});

test.describe('more shapes (prompt 044)', () => {
  async function dragFrom(
    page: Page,
    from: { x: number; y: number },
    to: { x: number; y: number },
    during?: () => Promise<void>,
  ) {
    const a = await toClient(page, from.x, from.y);
    const b = await toClient(page, to.x, to.y);
    await page.mouse.move(a.clientX, a.clientY);
    await page.mouse.down();
    await page.mouse.move(b.clientX, b.clientY, { steps: 6 });
    await during?.();
    await page.mouse.up();
    await frames(page);
  }

  test('a star with ↑ gets a point more; a rounded rectangle has rx; a grid is one path', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page);
    await centerOn(page, 1, { x: 400, y: 400 });
    await tool(page, 'sketch.dragStar');
    await page.locator('.viewport').focus();
    await dragFrom(page, { x: 400, y: 400 }, { x: 400, y: 300 }, async () => {
      await page.keyboard.press('ArrowUp');
    });
    let s = await selected(page);
    expect(s?.tag).toBe('path');
    expect(s!.attrs['d'].match(/L/g)).toHaveLength(11);
    await tool(page, 'sketch.dragRoundRect');
    await dragFrom(page, { x: 300, y: 300 }, { x: 400, y: 360 });
    s = await selected(page);
    expect(s?.tag).toBe('rect');
    expect(Number(s!.attrs['rx'])).toBe(12);
    await tool(page, 'sketch.dragRectGrid');
    await dragFrom(page, { x: 250, y: 250 }, { x: 550, y: 550 });
    s = await selected(page);
    expect(s!.attrs['d'].match(/M/g)).toHaveLength(11);
    expect(errors).toEqual([]);
  });
});
