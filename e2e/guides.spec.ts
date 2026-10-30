import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 056 – guides out of the rulers, icon grid templates (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'g.svg', svg('<rect x="0" y="0" width="4" height="4"/>'));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
}

function guides(page: Page) {
  return page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('g.svg')!.svg!.root;
    return [...root.querySelectorAll('[data-guide]')].map((g) => [
      g.getAttribute('data-guide'),
      g.getAttribute('y1'),
      g.getAttribute('x1'),
    ]);
  });
}

test('drag a guide out of the top ruler; it is a construction line; one undo step', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  const ruler = await page.locator('app-canvas-ruler.ruler-x').boundingBox();
  const target = await toClient(page, 400, 333);
  await page.mouse.move(target.clientX, ruler!.y + ruler!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.clientX, target.clientY - 40, { steps: 3 });
  await expect(page.getByTestId('guide-preview')).toBeVisible();
  await page.mouse.move(target.clientX, target.clientY, { steps: 3 });
  await page.mouse.up();
  await frames(page);
  expect(await guides(page)).toEqual([['horizontal', '333', '-4096']]);
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Add Guide',
  );
  const line = await page.evaluate(() => {
    const el = window
      .__appIconic!.store()!
      .document()
      .assets.get('g.svg')!
      .svg!.root.querySelector('[data-guide]')!;
    return [el.hasAttribute('data-construction'), el.getAttribute('opacity')];
  });
  expect(line).toEqual([true, '0']);
  // a vertical one from the left ruler, by the AI's action
  await page.evaluate(() => window.__appIconic!.run('guide.add', { axis: 'vertical', at: 200 }));
  await expect.poll(async () => (await guides(page)).length).toBe(2);
  expect(errors).toEqual([]);
});

test('a drawn point snaps onto a guide', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('guide.add', { axis: 'horizontal', at: 300 }));
  await expect.poll(async () => (await guides(page)).length).toBe(1);
  await snapping(page, true);
  await page.evaluate(() => window.__appIconic!.run('sketch.line'));
  for (const [x, y] of [
    [250, 304],
    [450, 296],
  ]) {
    const c = await toClient(page, x, y);
    await page.mouse.move(c.clientX, c.clientY, { steps: 3 });
    await page.mouse.down();
    await page.mouse.up();
    await frames(page);
  }
  await page.keyboard.press('Escape');
  const ys = await page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('g.svg')!.svg!.root;
    const l = [...root.querySelectorAll('line:not([data-guide])')].at(-1)!;
    return [l.getAttribute('y1'), l.getAttribute('y2')];
  });
  expect(ys).toEqual(['300', '300']);
});

test('icon grid templates: Material keylines and an even grid', async ({ page }) => {
  await setup(page);
  const count = () => page.locator('svg .guides line').count();
  const apple = await count();
  await page.evaluate(() => window.__appIconic!.run('view.guideTemplate.material'));
  await expect.poll(count).toBe(20);
  await page.evaluate(() => window.__appIconic!.run('view.guideTemplate.grid'));
  await page.evaluate(() => window.__appIconic!.run('view.guideDivisions', { divisions: 4 }));
  await expect.poll(count).toBe(2 + 2 * 3);
  expect(apple).toBe(16);
});

test('guides are locked: Select All and a move leave them alone; lock off, clear all (066)', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('guide.add', { axis: 'horizontal', at: 300 }));
  await expect.poll(async () => (await guides(page)).length).toBe(1);
  expect(
    await page.evaluate(
      () => window.__appIconic!.actions().find((a) => a.id === 'guides.lock')!.checked,
    ),
  ).toBe(true);
  // ⌘A and an arrow key: only the rect moves
  await page.locator('.viewport').focus();
  await page.evaluate(() => window.__appIconic!.run('edit.selectAll'));
  const tags = await page.evaluate(() => {
    const h = window.__appIconic!;
    return h
      .store()!
      .selection()
      .map((r) => h.store()!.document().node(r)!.localName);
  });
  expect(tags).toEqual(['rect']);
  await page.evaluate(() => window.__appIconic!.run('arrange.moveBy', { dx: 0, dy: 10 }));
  expect(await guides(page)).toEqual([['horizontal', '300', '-4096']]);
  // the tree names it
  await expect(page.locator('[role="treeitem"]', { hasText: 'Guide y 300' })).toHaveCount(1);
  // unlocked: Select All takes it too
  await page.evaluate(() => window.__appIconic!.run('guides.lock'));
  await page.evaluate(() => window.__appIconic!.run('edit.selectAll'));
  expect(await page.evaluate(() => window.__appIconic!.store()!.selection().length)).toBe(2);
  // clear all: one undo step
  await page.evaluate(() => window.__appIconic!.run('guides.clear'));
  expect(await guides(page)).toEqual([]);
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Clear Guides',
  );
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  expect(await guides(page)).toHaveLength(1);
});
