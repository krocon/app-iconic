import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/**
 * Prompt 067 – one context bar for every active tool (Chromium, browser mode): name, options,
 * Done; the fillet radius is set before the click, the rectangle tool's fill in the bar is the new
 * shape's fill; F6 goes into the bar, Esc back to the canvas.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body = '') {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'cb.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
}

async function click(page: Page, x: number, y: number) {
  const c = await toClient(page, x, y);
  await page.mouse.move(c.clientX, c.clientY, { steps: 3 });
  await page.mouse.down();
  await page.mouse.up();
  await frames(page);
}

function shapes(page: Page) {
  return page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('cb.svg')!.svg!.root;
    return [...root.children].map((e) => {
      const b = (e as SVGGraphicsElement).getBBox();
      return [e.localName, ...[b.x, b.y, b.width, b.height].map((v) => Math.round(v))];
    });
  });
}

test('the fillet radius is set in the bar before the click', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(
    page,
    '<line x1="200" y1="500" x2="500" y2="500" stroke="#000"/><line x1="500" y1="500" x2="500" y2="200" stroke="#000"/>',
  );
  await page.evaluate(() => window.__appIconic!.run('fillet.tool'));
  const bar = page.getByTestId('context-bar');
  await expect(bar.getByTestId('context-name')).toHaveText('Fillet');
  await bar.getByTestId('context-size').fill('20');
  await bar.getByTestId('context-size').press('Enter');
  await click(page, 300, 500);
  await click(page, 500, 300);
  await expect(page.locator('[data-field="size"]')).toHaveValue('20');
  await page.getByTestId('fillet-ok').click();
  expect(await shapes(page)).toEqual([
    ['path', 200, 480, 300, 20],
    ['path', 500, 200, 0, 280],
  ]);
  expect(errors).toEqual([]);
});

test('the rectangle tool: fill in the bar is the fill of the new shape', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('sketch.dragRect'));
  const bar = page.getByTestId('context-bar');
  await expect(bar.getByTestId('context-name')).toHaveText('Rectangle Tool');
  await bar.getByTestId('context-fill-text').fill('#ff0000');
  await bar.getByTestId('context-fill-text').press('Enter');
  // the AI's way works the same
  expect(
    await page.evaluate(() =>
      window.__appIconic!.run('tool.option', { key: 'strokeWidth', value: 3 }),
    ),
  ).toBe(true);
  const a = await toClient(page, 300, 300);
  const b = await toClient(page, 500, 400);
  await page.mouse.move(a.clientX, a.clientY);
  await page.mouse.down();
  await page.mouse.move(b.clientX, b.clientY, { steps: 5 });
  await page.mouse.up();
  await frames(page);
  const attrs = await page.evaluate(() => {
    const root = window.__appIconic!.store()!.document().assets.get('cb.svg')!.svg!.root;
    const r = root.querySelector('rect')!;
    return [r.getAttribute('fill'), r.getAttribute('stroke-width')];
  });
  expect(attrs).toEqual(['#ff0000', '3']);
});

test('every tool shows the bar; Done ends it; F6 and Esc move the keyboard', async ({ page }) => {
  await setup(page);
  for (const id of [
    'add.freehand',
    'pen.tool',
    'trim.tool',
    'measure.tool',
    'constraint.tool',
    'fill.tool',
  ]) {
    await page.evaluate((i) => window.__appIconic!.run(i), id);
    const label = await page.evaluate(
      (i) => window.__appIconic!.actions().find((a) => a.id === i)!.label,
      id,
    );
    await expect(page.getByTestId('context-name'), id).toHaveText(label);
    await page.getByTestId('context-done').click();
    await expect(page.getByTestId('context-bar'), id).toHaveCount(0);
  }
  // the selection tools have no bar
  await page.keyboard.press('v');
  await expect(page.getByTestId('context-bar')).toHaveCount(0);
  // F6 into the bar, Esc back to the canvas – the tool stays on
  await page.locator('.viewport').focus();
  await page.keyboard.press('p');
  await expect(page.getByTestId('context-name')).toHaveText('Pen');
  await page.keyboard.press('F6');
  await expect(page.getByTestId('context-fill')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.viewport')).toBeFocused();
  await expect(page.getByTestId('context-name')).toHaveText('Pen');
});
