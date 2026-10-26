import { expect, Page, test } from '@playwright/test';
import { importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { menu } from './menu-helpers';
import {
  attr,
  centerOn,
  close,
  drag,
  frames,
  handles,
  idOf,
  select,
  snapping,
  view,
} from './selection-helpers';

/**
 * Prompt 007 – working on the canvas with the mouse and keys (Chromium, browser mode): hit
 * testing, group context, marquee, Magic Snap at 19 / 21 screen px, Escape, one undo step per
 * gesture, arrow keys, point insertion / deletion, box scaling.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'sel.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<line id="l" x1="200" y1="300" x2="300" y2="300" stroke="#fff" stroke-width="1"/>' +
  '<rect id="t" x="600" y="500" width="40" height="40" fill="#f00"/>' +
  '<g id="grp" transform="translate(100 700) rotate(10)">' +
  '<rect id="a" x="0" y="0" width="60" height="40" fill="#0f0"/>' +
  '<circle id="b" cx="120" cy="20" r="20" fill="#00f"/></g>' +
  '<polygon id="pg" points="400,100 500,100 450,180" fill="#ff0"/>' +
  '<path id="p" d="M700 100 L800 100 L800 200" stroke="#0ff" stroke-width="6" fill="none"/>' +
  '</svg>';

async function setup(page: Page, zoom = 1) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, SVG);
  await view(page, zoom, 0, 0);
  await centerOn(page, zoom, { x: 512, y: 512 });
}

const selected = (page: Page) =>
  page.evaluate(() =>
    window
      .__appIconic!.store()!
      .selection()
      .map((r) => r.id),
  );

const id = (page: Page, sel: string) => idOf(page, A, sel);

async function click(page: Page, x: number, y: number, mods: ('Shift' | 'Alt' | 'Control')[] = []) {
  const c = await toClient(page, x, y);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.click(c.clientX, c.clientY);
  for (const m of mods) await page.keyboard.up(m);
  await frames(page);
}

test('click selects what is under the pointer; double click enters a group, Esc leaves it', async ({
  page,
}) => {
  await setup(page, 0.5); // the whole canvas is visible
  await click(page, 620, 520);
  expect(await selected(page)).toEqual([await id(page, '#t')]);
  // a thin line is hit within a few screen pixels (here 2)
  await click(page, 250, 304);
  expect(await selected(page)).toEqual([await id(page, '#l')]);
  // ⇧ adds, Ctrl toggles (Linux in Playwright)
  await click(page, 620, 520, ['Shift']);
  expect((await selected(page)).sort()).toEqual(
    [await id(page, '#l'), await id(page, '#t')].sort(),
  );
  await click(page, 620, 520, ['Control']);
  expect(await selected(page)).toEqual([await id(page, '#l')]);
  // a click into a group selects the group …
  await click(page, 110, 715);
  expect(await selected(page)).toEqual([await id(page, '#grp')]);
  // … a double click goes into it and selects the child
  const c = await toClient(page, 110, 715);
  await page.mouse.dblclick(c.clientX, c.clientY);
  await frames(page);
  expect(await selected(page)).toEqual([await id(page, '#a')]);
  // inside the group context another child is selected directly
  const b = await page.evaluate(() => {
    const hook = window.__appIconic!;
    const el = hook.store()!.document().assets.get('sel.svg')!.svg!.root.querySelector('#b')!;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(b.x, b.y);
  await frames(page);
  expect(await selected(page)).toEqual([await id(page, '#b')]);
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual([await id(page, '#grp')]);
  await page.keyboard.press('Escape');
  expect(await selected(page)).toEqual([]);
  // click into the void clears the selection
  await click(page, 620, 520);
  await click(page, 900, 900);
  expect(await selected(page)).toEqual([]);
});

test('a marquee selects the nodes whose document bounds it meets', async ({ page }) => {
  await setup(page);
  const a = await toClient(page, 560, 280);
  const b = await toClient(page, 610, 510);
  await page.mouse.move(a.clientX, a.clientY);
  await page.mouse.down();
  await page.mouse.move(b.clientX, b.clientY, { steps: 5 });
  await frames(page);
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up();
  await frames(page);
  // line (ends at x 300) is outside, the rect (from 600, 500) inside
  expect(await selected(page)).toEqual([await id(page, '#t')]);
  await expect(page.getByTestId('marquee')).toHaveCount(0);
});

for (const zoom of [0.5, 1, 1.5]) {
  test(`Magic Snap catches at 19 screen px but not at 21 (zoom ${zoom * 100} %)`, async ({
    page,
  }) => {
    await setup(page, zoom);
    await centerOn(page, zoom, { x: 450, y: 400 });
    await snapping(page, true);
    const line = await id(page, '#l');
    for (const [offset, snaps] of [
      [19, true],
      [21, false],
    ] as const) {
      await select(page, A, [line]);
      const h = (await handles(page))['0:lineEnd:2'];
      const target = await toClient(page, 600, 500); // top left corner of the rect
      await drag(page, h, target.clientX - offset - h.x, target.clientY - h.y);
      const x2 = Number(await attr(page, A, line, 'x2'));
      const y2 = Number(await attr(page, A, line, 'y2'));
      if (snaps) {
        expect(x2).toBeCloseTo(600, 3);
        expect(y2).toBeCloseTo(500, 3);
      } else {
        expect(Math.abs(x2 - (600 - 21 / zoom))).toBeLessThanOrEqual(0.5 / zoom);
        expect(Math.abs(y2 - 500)).toBeLessThanOrEqual(0.5 / zoom);
      }
      await page.evaluate(() => window.__appIconic!.store()!.undo());
    }
  });
}

test('Escape during a drag restores everything; a drag is ONE undo step', async ({ page }) => {
  await setup(page);
  await snapping(page, false);
  const t = await id(page, '#t');
  const c = await toClient(page, 620, 520);
  const start = { x: c.clientX, y: c.clientY };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 50, start.y + 30, { steps: 5 });
  await frames(page);
  expect(await attr(page, A, t, 'transform')).toBe('translate(50 30)');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await frames(page);
  expect(await attr(page, A, t, 'transform')).toBeNull();
  expect(await page.evaluate(() => window.__appIconic!.lastCommand()!.type)).toBe('composite'); // import
  // now a real drag in many steps: one command, one undo
  await drag(page, start, 40, -25, 12);
  expect(await attr(page, A, t, 'transform')).toBe('translate(40 -25)');
  expect(await page.evaluate(() => window.__appIconic!.lastCommand())).toEqual({
    type: 'setAttributes',
    changes: [{ ref: { asset: A, id: t }, name: 'transform', value: 'translate(40 -25)' }],
    label: 'moveNode',
  });
  await menu(page, 'Edit', 'Undo Move Node');
  expect(await attr(page, A, t, 'transform')).toBeNull();
});

test('arrow keys nudge 1 / ⇧ 10 document units as one undo step; the canvas edge holds', async ({
  page,
}) => {
  await setup(page, 1.5);
  const t = await id(page, '#t');
  await click(page, 620, 520);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await attr(page, A, t, 'transform')).toBe('translate(3 10)');
  await menu(page, 'Edit', 'Undo Move Node');
  expect(await attr(page, A, t, 'transform')).toBeNull();
  // the AI path: moveBy with the BoundsGuard (the rect ends at 640: 384 more fit)
  expect(
    await page.evaluate(() => window.__appIconic!.run('arrange.moveBy', { dx: 1000, dy: 0 })),
  ).toBe(true);
  expect(await attr(page, A, t, 'transform')).toBe('translate(384 0)');
});

test('points: a midpoint click inserts, Alt-click and Delete remove', async ({ page }) => {
  await setup(page);
  const pg = await id(page, '#pg');
  await centerOn(page, 1, { x: 450, y: 140 });
  await select(page, A, [pg]);
  let hs = await handles(page);
  await page.mouse.click(hs['0:segment:0'].x, hs['0:segment:0'].y);
  await frames(page);
  expect(await attr(page, A, pg, 'points')).toBe('400,100 450,100 500,100 450,180');
  hs = await handles(page);
  await page.keyboard.down('Alt');
  await page.mouse.click(hs['0:vertex:1'].x, hs['0:vertex:1'].y);
  await page.keyboard.up('Alt');
  await frames(page);
  expect(await attr(page, A, pg, 'points')).toBe('400,100 500,100 450,180');
  // a path: insert by the midpoint, choose an anchor, Delete removes it (not the node)
  const p = await id(page, '#p');
  await centerOn(page, 1, { x: 750, y: 150 });
  await select(page, A, [p]);
  hs = await handles(page);
  await page.mouse.click(hs['0:pathMid:2'].x, hs['0:pathMid:2'].y);
  await frames(page);
  expect(await attr(page, A, p, 'd')).toBe('M700 100 L800 100 L800 150 L800 200');
  hs = await handles(page);
  await page.mouse.click(hs['0:pathAnchor:1'].x, hs['0:pathAnchor:1'].y);
  await frames(page);
  await page.keyboard.press('Delete');
  await frames(page);
  expect(await attr(page, A, p, 'd')).toBe('M700 100 L800 150 L800 200');
  expect(await selected(page)).toEqual([p]);
});

test('boxed mode scales a rotated node about the opposite corner', async ({ page }) => {
  await setup(page);
  await snapping(page, false);
  await page.evaluate(() => window.__appIconic!.run('view.selectionMode.boxed'));
  const a = await id(page, '#a');
  await centerOn(page, 1, { x: 130, y: 720 });
  await select(page, A, [a]);
  const tl = () =>
    page.evaluate((a) => {
      const m = window.__appIconic!.nodeToDocument('sel.svg', a)!;
      return { x: m[4], y: m[5] };
    }, a);
  const before = await tl();
  const h = (await handles(page))['0:box:bottomRight'];
  await drag(page, h, 40, 10);
  close(await tl(), before, 0.01);
  expect(await attr(page, A, a, 'transform')).toMatch(/^matrix\(/);
  expect(await page.evaluate(() => window.__appIconic!.lastCommand()!)).toMatchObject({
    type: 'setAttributes',
    label: 'changeTransform',
  });
});
