import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/**
 * Prompt 049 – construction lines, circular / rectangular pattern, mirror and linked clone like
 * Fusion 360 (Chromium, browser mode).
 */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'pat.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const el = doc.assets.get('pat.svg')!.svg!.root.querySelector('#s')!;
    h.store()!.selection.set([doc.refOf(el)!]);
  });
}

async function click(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 2 });
  await page.mouse.down();
  await page.mouse.up();
  await frames(page);
}

/** Centres (document units) of the asset's shapes as the browser lays them out. */
function centres(page: Page) {
  return page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    const root = doc.assets.get('pat.svg')!.svg!.root;
    const host = root.ownerSVGElement ?? root;
    return [...root.children].map((e) => {
      const g = e as SVGGraphicsElement;
      const b = g.getBBox();
      const m = root.getScreenCTM()!.inverse().multiply(g.getScreenCTM()!);
      const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m);
      void host;
      return [Math.round(p.x), Math.round(p.y)];
    });
  });
}

const CIRCLE = '<circle id="s" cx="400" cy="250" r="30" fill="#f80"/>';

test('circular pattern: pick the centre, quantity in the dialog, live, one undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page, CIRCLE);
  await page.evaluate(() => window.__appIconic!.run('pattern.circular'));
  await expect(page.getByTestId('sketch-hint')).toContainText('centre');
  await click(page, 400, 400);
  const count = page.locator('[data-field="count"]');
  await expect(count).toBeVisible();
  await expect.poll(async () => (await centres(page)).length).toBe(6);
  await count.fill('4');
  await expect.poll(async () => (await centres(page)).length).toBe(4);
  await page.getByTestId('pattern-ok').click();
  expect((await centres(page)).sort()).toEqual(
    [
      [400, 250],
      [550, 400],
      [400, 550],
      [250, 400],
    ].sort(),
  );
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Circular Pattern',
  );
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await centres(page)).toEqual([[400, 250]]);
  expect(errors).toEqual([]);
});

test('rectangular pattern: Cancel takes the preview back, arguments make it at once', async ({
  page,
}) => {
  await setup(page, '<rect id="s" x="300" y="300" width="40" height="40"/>');
  await page.evaluate(() => window.__appIconic!.run('pattern.rectangular'));
  await expect.poll(async () => (await centres(page)).length).toBe(3);
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await centres(page)).toEqual([[320, 320]]);
  await page.evaluate(() =>
    window.__appIconic!.run('pattern.rectangular', { columns: 2, rows: 2, dx: 100, dy: 50 }),
  );
  expect(await centres(page)).toEqual([
    [320, 320],
    [420, 320],
    [320, 370],
    [420, 370],
  ]);
});

test('mirror across two picked points; a pattern inside a rotated group', async ({ page }) => {
  await setup(
    page,
    '<g transform="rotate(30 400 400)"><path id="s" d="M 300 300 L 340 300 L 300 360 Z"/></g>',
  );
  const before = (await page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    const el = doc.assets.get('pat.svg')!.svg!.root.querySelector('#s') as SVGGraphicsElement;
    const b = el.getBBox();
    const m = (el.ownerSVGElement as SVGGraphicsElement)
      .getScreenCTM()!
      .inverse()
      .multiply(el.getScreenCTM()!);
    const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m);
    return [p.x, p.y];
  })) as [number, number];
  await page.evaluate(() => window.__appIconic!.run('pattern.mirror'));
  await click(page, 500, 200);
  await click(page, 500, 600);
  const after = await page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    const els = [
      ...doc.assets.get('pat.svg')!.svg!.root.querySelectorAll('path'),
    ] as SVGGraphicsElement[];
    return els.map((el) => {
      const b = el.getBBox();
      const m = (el.ownerSVGElement as SVGGraphicsElement)
        .getScreenCTM()!
        .inverse()
        .multiply(el.getScreenCTM()!);
      const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(m);
      return [p.x, p.y];
    });
  });
  expect(after).toHaveLength(2);
  expect(after[1][0]).toBeCloseTo(1000 - before[0], 0);
  expect(after[1][1]).toBeCloseTo(before[1], 0);
});

test('linked clone follows its original', async ({ page }) => {
  await setup(page, CIRCLE);
  await page.evaluate(() => window.__appIconic!.run('edit.cloneLinked'));
  const use = await page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    const root = doc.assets.get('pat.svg')!.svg!.root;
    return root.querySelector('use')?.getAttribute('href');
  });
  expect(use).toBe('#s');
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Clone (Linked)',
  );
});

test('construction line: X makes it transparent in the file, dashed on the canvas, not exported', async ({
  page,
}) => {
  await setup(
    page,
    '<line id="s" x1="300" y1="300" x2="500" y2="500" stroke="#000" opacity="0.5"/>',
  );
  await page.locator('.viewport').focus();
  await page.keyboard.press('x');
  const state = await page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    const el = doc.assets.get('pat.svg')!.svg!.root.querySelector('#s')!;
    const cs = getComputedStyle(el);
    return {
      attr: el.getAttribute('data-construction'),
      opacity: el.getAttribute('opacity'),
      shown: cs.opacity,
      dash: cs.strokeDasharray,
    };
  });
  expect(state).toEqual({ attr: '0.5', opacity: '0', shown: '1', dash: '6px, 4px' });
  await page.keyboard.press('x');
  const back = await page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    const el = doc.assets.get('pat.svg')!.svg!.root.querySelector('#s')!;
    return [el.hasAttribute('data-construction'), el.getAttribute('opacity')];
  });
  expect(back).toEqual([false, '0.5']);
});
