import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/**
 * Prompt 046 – path editing like VectorCraft (Chromium, browser mode): add / delete / convert
 * anchor points, Scissors, Smooth, Path Eraser, Join, Convert to Path, the pen's Auto Add/Delete.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'paths.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const els = [...doc.assets.get('paths.svg')!.svg!.root.querySelectorAll('path, rect')];
    h.store()!.selection.set(els.map((el) => doc.refOf(el)!));
  });
}

async function at(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 2 });
}

async function click(page: Page, x: number, y: number) {
  await at(page, x, y);
  await page.mouse.down();
  await page.mouse.up();
  await frames(page);
}

function paths(page: Page) {
  return page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    return [...doc.assets.get('paths.svg')!.svg!.root.children]
      .filter((e) => e.localName !== 'rect' || e.getAttribute('width') !== '4')
      .map((e) => (e.localName === 'path' ? e.getAttribute('d') : e.localName));
  });
}

const LINE = '<path d="M 250 400 L 550 400" fill="none" stroke="#000"/>';

test('add, convert and delete an anchor point; every edit one undo step', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page, LINE);
  await page.evaluate(() => window.__appIconic!.run('path.addAnchor'));
  await expect(page.getByTestId('sketch-hint')).toContainText('Add Anchor Point');
  await click(page, 400, 400);
  expect(await paths(page)).toEqual(['M 250 400 L 400 400 L 550 400']);
  await page.evaluate(() => window.__appIconic!.run('path.anchorPoint'));
  await at(page, 400, 400);
  await page.mouse.down();
  await at(page, 450, 400);
  await page.mouse.up();
  await frames(page);
  expect((await paths(page))[0]).toMatch(/C 350 400 400 400|C .* 350 400 400 400/);
  await page.evaluate(() => window.__appIconic!.run('path.deleteAnchor'));
  await click(page, 400, 400);
  expect(await paths(page)).toEqual(['M 250 400 L 550 400']);
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Edit Path',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sketch-hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Scissors split an open path into two; Join puts them together again', async ({ page }) => {
  await setup(page, LINE);
  await page.evaluate(() => window.__appIconic!.run('path.scissors'));
  await click(page, 400, 400);
  expect(await paths(page)).toEqual(['M 250 400 L 400 400', 'M 400 400 L 550 400']);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const els = [...doc.assets.get('paths.svg')!.svg!.root.querySelectorAll('path')];
    h.store()!.selection.set(els.map((el) => doc.refOf(el)!));
  });
  await page.evaluate(() => window.__appIconic!.run('path.join'));
  await frames(page);
  expect(await paths(page)).toEqual(['M 250 400 L 400 400 L 550 400']);
});

test('Path Eraser removes the part under the brush; Smooth rounds corners', async ({ page }) => {
  await setup(page, LINE);
  await page.evaluate(() => window.__appIconic!.run('path.eraser'));
  await at(page, 400, 330);
  await page.mouse.down();
  await at(page, 400, 470);
  await page.mouse.up();
  await frames(page);
  const parts = (await paths(page))[0]!;
  expect(parts.match(/M/g)).toHaveLength(2);
  await page.keyboard.press('Escape');

  await setup(page, '<path d="M 250 450 L 400 300 L 550 450" fill="none" stroke="#000"/>');
  await page.evaluate(() => window.__appIconic!.run('path.smooth'));
  await at(page, 330, 380);
  await page.mouse.down();
  await at(page, 400, 300);
  await at(page, 470, 380);
  await page.mouse.up();
  await frames(page);
  expect((await paths(page))[0]).toContain('C');
});

test('Convert to Path turns a rect into a path with its look', async ({ page }) => {
  await setup(page, '<rect x="300" y="300" width="200" height="100" fill="#f00"/>');
  await page.evaluate(() => window.__appIconic!.run('path.convert'));
  await frames(page);
  expect(await paths(page)).toEqual(['M 300 300 L 500 300 L 500 400 L 300 400 Z']);
  const fill = await page.evaluate(() => {
    const doc = window.__appIconic!.store()!.document();
    return doc.assets.get('paths.svg')!.svg!.root.querySelector('path')!.getAttribute('fill');
  });
  expect(fill).toBe('#f00');
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Convert to Path',
  );
});

test('the pen adds a point on the selected path and deletes one on a point', async ({ page }) => {
  await setup(page, '<path d="M 250 400 L 400 400 L 550 400" fill="none" stroke="#000"/>');
  await page.evaluate(() => window.__appIconic!.run('pen.tool'));
  await click(page, 400, 400);
  expect(await paths(page)).toEqual(['M 250 400 L 550 400']);
  await click(page, 300, 400);
  expect(await paths(page)).toEqual(['M 250 400 L 300 400 L 550 400']);
});

test('Scissors open a circle: one open path through its old outline', async ({ page }) => {
  await setup(page, '<circle cx="400" cy="400" r="100" fill="none" stroke="#000"/>');
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const el = doc.assets.get('paths.svg')!.svg!.root.querySelector('circle')!;
    h.store()!.selection.set([doc.refOf(el)!]);
  });
  await page.evaluate(() => window.__appIconic!.run('path.scissors'));
  await click(page, 500, 400);
  const [d] = await paths(page);
  expect(d).toMatch(/^M 500 400 C/);
  expect(d).not.toContain('Z');
  expect(d!.endsWith('500 400')).toBe(true);
});
