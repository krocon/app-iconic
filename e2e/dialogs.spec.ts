import { expect, Page, test } from '@playwright/test';
import { importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/**
 * Every modal dialog fits (Marc, 29.10.2026): no field, button or text sticks out of the dialog
 * box, in a small and a large window.
 */

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="r" x="300" y="300" width="200" height="120" fill="#f80"/><path id="p" d="M 100 100 L 200 150 L 120 260 Z"/></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'd.svg', svg);
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
}

async function selectRect(page: Page, id = 'r') {
  await page.evaluate((id) => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const el = doc.assets.get('d.svg')!.svg!.root.querySelector(`#${id}`)!;
    h.store()!.selection.set([doc.refOf(el)!]);
  }, id);
}

/** Elements inside the open dialog that stick out of its box (px beyond). */
function overflow(page: Page) {
  return page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]') as HTMLElement | null;
    if (!d) return ['no dialog'];
    const box = d.getBoundingClientRect();
    const out: string[] = [];
    if (box.right > innerWidth + 0.5 || box.left < -0.5)
      out.push(`dialog ${box.left}…${box.right}`);
    for (const el of d.querySelectorAll<HTMLElement>(
      'input, select, textarea, button, label, p, span',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || el.closest('[hidden], .cm-editor')) continue;
      const beyond = Math.max(r.right - box.right, box.left - r.left);
      if (beyond > 0.5)
        out.push(`${el.tagName.toLowerCase()}.${el.className} ${Math.round(beyond)}px`);
    }
    if (d.scrollWidth > d.clientWidth + 1) out.push(`scrolls ${d.scrollWidth} > ${d.clientWidth}`);
    return out;
  });
}

const run = (page: Page, id: string, args?: unknown) =>
  page.evaluate(([id, args]) => window.__appIconic!.run(id as string, args as never), [id, args]);

const DIALOGS: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'about', open: (p) => run(p, 'app.about') },
  { name: 'palette', open: (p) => run(p, 'app.palette') },
  { name: 'shortcuts', open: (p) => run(p, 'app.shortcuts') },
  { name: 'settings', open: (p) => run(p, 'app.settings') },
  { name: 'svg snippet', open: (p) => run(p, 'add.svgSnippet') },
  { name: 'symbol', open: (p) => run(p, 'add.symbol') },
  { name: 'text to path', open: (p) => run(p, 'add.textToPath') },
  { name: 'export', open: (p) => run(p, 'file.exportPng') },
  { name: 'edit svg', open: async (p) => (await selectRect(p), run(p, 'edit.editSvg')) },
  { name: 'optimize path', open: async (p) => (await selectRect(p, 'p'), run(p, 'path.optimize')) },
  { name: 'corners', open: async (p) => (await selectRect(p), run(p, 'corners.set')) },
  {
    name: 'rectangular pattern',
    open: async (p) => (await selectRect(p), run(p, 'pattern.rectangular')),
  },
  {
    name: 'circular pattern',
    open: async (p) => {
      await selectRect(p);
      await run(p, 'pattern.circular');
      await run(p, 'pattern.centerHere');
    },
  },
  { name: 'transform', open: async (p) => (await selectRect(p), run(p, 'transform.dialog')) },
  { name: 'offset', open: async (p) => (await selectRect(p), run(p, 'path.offset')) },
  {
    name: 'fillet',
    open: async (p) => {
      await centerOn(p, 0.4, { x: 400, y: 360 });
      await run(p, 'fillet.tool');
      await new Promise((r) => setTimeout(r, 300));
      const c = await toClient(p, 500, 300);
      await p.mouse.click(c.clientX, c.clientY);
    },
  },
  {
    name: 'shape size',
    open: async (p) => {
      await run(p, 'sketch.dragPolygon');
      const c = await toClient(p, 450, 520);
      await p.mouse.click(c.clientX, c.clientY);
    },
  },
];

for (const size of [
  { width: 1024, height: 700 },
  { width: 1600, height: 1000 },
]) {
  test.describe(`dialogs fit (${size.width} × ${size.height})`, () => {
    test.use({ viewport: size });
    for (const d of DIALOGS) {
      test(d.name, async ({ page }) => {
        await setup(page);
        await d.open(page);
        await expect(page.locator('[role="dialog"]')).toBeVisible();
        await frames(page, 3);
        expect(await overflow(page)).toEqual([]);
      });
    }
  });
}

test.describe('stepper fields', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('− / + and ↑ / ↓ change the quantity; the preview follows', async ({ page }) => {
    await setup(page);
    await selectRect(page);
    await run(page, 'pattern.circular');
    await run(page, 'pattern.centerHere');
    const count = page.locator('[data-field="count"]');
    await expect(count).toHaveValue('6');
    const plus = page.locator('app-stepper-field:has([data-field="count"]) [data-step="up"]');
    await plus.click();
    await plus.click();
    await expect(count).toHaveValue('8');
    await count.focus();
    await page.keyboard.press('ArrowDown');
    await expect(count).toHaveValue('7');
    await page.keyboard.press('Shift+ArrowUp');
    await expect(count).toHaveValue('17');
    const minus = page.locator('app-stepper-field:has([data-field="count"]) [data-step="down"]');
    await count.fill('2');
    await expect(minus).toBeDisabled();
    await count.fill('5');
    await page.getByTestId('pattern-ok').click();
    const rects = await page.evaluate(
      () =>
        window
          .__appIconic!.store()!
          .document()
          .assets.get('d.svg')!
          .svg!.root.querySelectorAll('rect').length,
    );
    expect(rects).toBe(5);
  });
});
