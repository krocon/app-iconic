import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { centerOn, snapping } from './selection-helpers';

/** Prompt 052 – Offset Path and Outline Stroke (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'o.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const els = [...doc.assets.get('o.svg')!.svg!.root.children];
    h.store()!.selection.set(els.map((e) => doc.refOf(e)!));
  });
}

function shapes(page: Page) {
  return page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('o.svg')!.svg!.root;
    return [...root.children].map((e) => {
      const b = (e as SVGGraphicsElement).getBBox();
      return {
        tag: e.localName,
        fill: e.getAttribute('fill'),
        stroke: e.getAttribute('stroke'),
        box: [b.x, b.y, b.width, b.height].map((v) => Math.round(v)),
      };
    });
  });
}

test('Offset Path dialog: live, the offset above the original, one undo step', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page, '<rect x="300" y="300" width="200" height="100" fill="#f80"/>');
  await page.evaluate(() => window.__appIconic!.run('path.offset'));
  await page.locator('[data-field="distance"]').fill('20');
  await page.locator('[data-field="join"]').selectOption('miter');
  await expect.poll(async () => (await shapes(page)).length).toBe(2);
  await page.getByTestId('offset-ok').click();
  const s = await shapes(page);
  expect(s[0]).toMatchObject({ tag: 'rect', box: [300, 300, 200, 100] });
  expect(s[1]).toMatchObject({ tag: 'path', fill: '#f80', box: [280, 280, 240, 140] });
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Offset Path',
  );
  expect(errors).toEqual([]);
});

test('Offset inwards, replacing; Cancel takes the preview back', async ({ page }) => {
  await setup(page, '<circle cx="400" cy="400" r="100" fill="#08f"/>');
  await page.evaluate(() => window.__appIconic!.run('path.offset'));
  await page.locator('[data-field="distance"]').fill('-30');
  await expect.poll(async () => (await shapes(page)).length).toBe(2);
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect((await shapes(page)).map((x) => x.tag)).toEqual(['circle']);
  await page.evaluate(() =>
    window.__appIconic!.run('path.offset', { distance: -30, replace: true }),
  );
  await expect
    .poll(() => shapes(page))
    .toEqual([{ tag: 'path', fill: '#08f', stroke: null, box: [330, 330, 140, 140] }]);
});

test('Outline Stroke: a stroked line becomes a filled band with the stroke colour', async ({
  page,
}) => {
  await setup(
    page,
    '<line x1="300" y1="400" x2="500" y2="400" stroke="#c00" stroke-width="20" stroke-linecap="round"/>' +
      '<rect x="300" y="200" width="100" height="100" fill="#0a0" stroke="#000" stroke-width="10"/>',
  );
  await page.evaluate(() => window.__appIconic!.run('path.outlineStroke'));
  await expect.poll(async () => (await shapes(page)).length).toBe(3);
  const s = await shapes(page);
  expect(s[0]).toMatchObject({
    tag: 'path',
    fill: '#c00',
    stroke: 'none',
    box: [290, 390, 220, 20],
  });
  expect(s[1]).toMatchObject({
    tag: 'path',
    fill: '#0a0',
    stroke: 'none',
    box: [300, 200, 100, 100],
  });
  expect(s[2]).toMatchObject({
    tag: 'path',
    fill: '#000',
    stroke: 'none',
    box: [295, 195, 110, 110],
  });
});
