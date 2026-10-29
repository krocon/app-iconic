import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { centerOn, snapping } from './selection-helpers';

/** Prompt 054 – distribute, align to canvas and key object (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

const THREE =
  '<circle id="a" cx="200" cy="300" r="20"/><circle id="b" cx="260" cy="340" r="30"/><circle id="c" cx="600" cy="320" r="20"/>';

async function setup(page: Page, ids: string[]) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'al.svg', svg(THREE));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
  await page.evaluate((ids) => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const root = doc.assets.get('al.svg')!.svg!.root;
    // one after another: the last one becomes the key object
    for (let i = 1; i <= ids.length; i++) {
      h.store()!.selection.set(
        ids.slice(0, i).map((id) => doc.refOf(root.querySelector(`#${id}`)!)!),
      );
    }
  }, ids);
}

function centres(page: Page) {
  return page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('al.svg')!.svg!.root;
    const inv = root.getScreenCTM()!.inverse();
    return [...root.querySelectorAll('circle')].map((c) => {
      const b = c.getBoundingClientRect();
      const p = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(inv);
      return [Math.round(p.x), Math.round(p.y)];
    });
  });
}

test('distribute horizontal centres with the button in the panel; one undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page, ['a', 'b', 'c']);
  await page.locator('[data-action="arrange.distribute.horizontalCenters"]').click();
  expect((await centres(page)).map((p) => p[0])).toEqual([200, 400, 600]);
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect((await centres(page)).map((p) => p[0])).toEqual([200, 260, 600]);
  await page.evaluate(() =>
    window.__appIconic!.run('arrange.distribute.spacing', { axis: 'horizontal', gap: 10 }),
  );
  // a at 180..220, then b (60 wide) at 230..290, c (40 wide) at 300..340
  expect((await centres(page)).map((p) => p[0])).toEqual([200, 260, 320]);
  expect(errors).toEqual([]);
});

test('align to the canvas works for one node; to the key object the key stays', async ({
  page,
}) => {
  await setup(page, ['b']);
  await page.getByTestId('align-to').selectOption('canvas');
  await page.locator('[data-action="arrange.align.centerH"]').click();
  await page.locator('[data-action="arrange.align.middle"]').click();
  expect((await centres(page))[1]).toEqual([512, 512]);
  await setup(page, ['a', 'c', 'b']);
  await page.getByTestId('align-to').selectOption('key');
  await expect(page.getByTestId('key-object')).toBeVisible();
  await page.evaluate(() => window.__appIconic!.run('arrange.align.top', { to: 'key' }));
  const c = await centres(page);
  // b is the key (selected last): top 310; a and c (r 20) move to centre y 330
  expect(c.map((p) => p[1])).toEqual([330, 340, 330]);
});
