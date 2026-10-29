import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { centerOn, snapping } from './selection-helpers';

/** Prompt 060 – live fills of enclosed areas (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

// a triangle of three open lines that overshoot (in a moved group) and a circle across it
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<g transform="translate(100 100)">' +
  '<line id="a" x1="180" y1="400" x2="620" y2="400" stroke="#000" stroke-width="4"/>' +
  '<line id="b" x1="200" y1="420" x2="200" y2="80" stroke="#000" stroke-width="4"/>' +
  '<line id="c" x1="180" y1="80" x2="620" y2="420" stroke="#000" stroke-width="4"/></g>' +
  '<circle id="o" cx="760" cy="760" r="120" fill="none" stroke="#000" stroke-width="4"/></svg>';

async function setup(page: Page, zoom = 0.75) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'lf.svg', SVG);
  await snapping(page, false);
  await centerOn(page, zoom, { x: 500, y: 500 });
  await page.evaluate(() => window.__appIconic!.store()!.selection.set([]));
}

/** Screen point of a document point. */
function screen(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const root = window.__appIconic!.store()!.document().assets.get('lf.svg')!.svg!.root;
      const p = new DOMPoint(x, y).matrixTransform((root as SVGSVGElement).getScreenCTM()!);
      return { x: p.x, y: p.y };
    },
    [x, y] as const,
  );
}

/** The live fills: fill colour and covered area in document units. */
const fills = (page: Page) =>
  page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('lf.svg')!.svg!.root;
    return [...root.querySelectorAll('[data-live-fill]')].map((el) => {
      const b = (el as SVGGraphicsElement).getBBox();
      return { fill: el.getAttribute('fill'), w: Math.round(b.width), h: Math.round(b.height) };
    });
  });

test('click fills the triangle of open lines; moving a line reshapes it in the same undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.keyboard.press('f');
  await expect(page.getByTestId('fill-color')).toBeVisible();
  // inside the triangle (document units: group moved by 100)
  const p = await screen(page, 340, 420);
  // paper.js loads with the tool: hover until the area shows
  await expect
    .poll(async () => {
      await page.mouse.move(p.x + 1, p.y);
      await page.mouse.move(p.x, p.y);
      return page.locator('[data-testid="fill-hover"] path').count();
    })
    .toBe(1);
  await page.mouse.click(p.x, p.y);
  // corners (200,400) (200,~95) (~594,400) in the group's space
  expect(await fills(page)).toEqual([{ fill: '#0a84ff', w: 394, h: 305 }]);
  // move line a down: the fill follows
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const ref = doc.refOf(doc.assets.get('lf.svg')!.svg!.root.querySelector('#a')!)!;
    h.runCommand({
      type: 'setAttributes',
      changes: [
        { ref, name: 'y1', value: '420' },
        { ref, name: 'y2', value: '420' },
      ],
    });
  });
  const moved = (await fills(page))[0];
  expect(moved.h).toBeGreaterThan(305);
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await fills(page)).toEqual([{ fill: '#0a84ff', w: 394, h: 305 }]);
  await page.evaluate(() => window.__appIconic!.run('edit.redo'));
  expect((await fills(page))[0].h).toBe(moved.h);
  expect(errors).toEqual([]);
});

test('a circle: Alt + click removes, the AI fills with a colour, detach keeps the path', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() =>
    window.__appIconic!.run('fill.at', { x: 760, y: 760, color: '#ff0000' }),
  );
  await expect.poll(() => fills(page)).toEqual([{ fill: '#ff0000', w: 240, h: 240 }]);
  // outside every closed area: nothing
  await page.evaluate(() => window.__appIconic!.run('fill.at', { x: 50, y: 50 }));
  await page.keyboard.press('f');
  const p = await screen(page, 760, 760);
  await page.keyboard.down('Alt');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Alt');
  expect(await fills(page)).toEqual([]);
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await fills(page)).toHaveLength(1);
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const el = doc.assets.get('lf.svg')!.svg!.root.querySelector('[data-live-fill]')!;
    h.store()!.selection.set([doc.refOf(el)!]);
    h.run('fill.detach');
  });
  expect(await fills(page)).toEqual([]);
});
