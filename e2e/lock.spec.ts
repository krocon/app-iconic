import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 055 – lock, isolate, hide construction lines (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'l.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
}

async function click(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.click(c.clientX, c.clientY);
  await frames(page);
}

function selectedIds(page: Page) {
  return page.evaluate(() => {
    const s = window.__appIconic!.store()!;
    return s.selection().map((r) => s.document().node(r)!.getAttribute('id'));
  });
}

async function select(page: Page, id: string) {
  await page.evaluate((id) => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    h.store()!.selection.set([
      doc.refOf(doc.assets.get('l.svg')!.svg!.root.querySelector(`#${id}`)!)!,
    ]);
  }, id);
}

test('a locked background is neither hit nor caught by the marquee; unlock all', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(
    page,
    '<rect id="bg" x="200" y="200" width="400" height="400" fill="#ddd"/><circle id="c" cx="300" cy="300" r="30" fill="#f00"/>',
  );
  await select(page, 'bg');
  await page.locator('.viewport').focus();
  await page.keyboard.press('Control+l');
  expect(await selectedIds(page)).toEqual([]);
  await expect(page.getByTestId('tree-lock').first()).toHaveClass(/on/);
  await click(page, 500, 500);
  expect(await selectedIds(page)).toEqual([]);
  await click(page, 300, 300);
  expect(await selectedIds(page)).toEqual(['c']);
  // marquee over both catches only the circle
  const a = await toClient(page, 150, 150);
  const b = await toClient(page, 650, 650);
  await page.mouse.move(a.clientX, a.clientY);
  await page.mouse.down();
  await page.mouse.move(b.clientX, b.clientY, { steps: 5 });
  await page.mouse.up();
  expect(await selectedIds(page)).toEqual(['c']);
  await page.evaluate(() => window.__appIconic!.run('edit.unlockAll'));
  await click(page, 500, 500);
  expect(await selectedIds(page)).toEqual(['bg']);
  expect(errors).toEqual([]);
});

test('isolate a group: the rest fades; construction lines can be hidden', async ({ page }) => {
  await setup(
    page,
    '<g id="g"><rect x="300" y="300" width="50" height="50"/></g><circle id="o" cx="500" cy="500" r="40"/>' +
      '<line id="k" x1="100" y1="100" x2="700" y2="700" stroke="#000" data-construction="" opacity="0"/>',
  );
  await select(page, 'g');
  await page.evaluate(() => window.__appIconic!.run('edit.isolate'));
  await frames(page, 4);
  const faded = await page.evaluate(() => {
    const layer = [...document.querySelectorAll<HTMLElement>('.layer')].find(
      (l) => l.dataset['asset'] === 'l.svg',
    )!;
    const root = layer.shadowRoot!;
    const op = (id: string) => getComputedStyle(root.querySelector(`#${id}`)!).opacity;
    return [op('g'), op('o')];
  });
  expect(faded).toEqual(['1', '0.25']);
  await page.evaluate(() => window.__appIconic!.run('edit.isolate'));
  await page.evaluate(() => window.__appIconic!.run('view.constructionLines'));
  await frames(page, 4);
  const shown = await page.evaluate(() => {
    const layer = [...document.querySelectorAll<HTMLElement>('.layer')].find(
      (l) => l.dataset['asset'] === 'l.svg',
    )!;
    const root = layer.shadowRoot!;
    return [
      getComputedStyle(root.querySelector('#o')!).opacity,
      getComputedStyle(root.querySelector('#k')!).display,
    ];
  });
  expect(shown).toEqual(['1', 'none']);
});
