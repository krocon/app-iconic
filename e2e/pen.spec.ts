import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/**
 * Prompt 042 – the pen like VectorCraft (Chromium, browser mode): clicks make corners, drags
 * smooth points, the first point closes, Enter ends, a selected open path goes on.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body = '<rect x="0" y="0" width="4" height="4"/>') {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'pen.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
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

function selected(page: Page) {
  return page.evaluate(() => {
    const h = window.__appIconic!;
    const ref = h.store()!.selection()[0];
    const el = ref ? h.store()!.document().node(ref) : null;
    return el ? { tag: el.localName, d: el.getAttribute('d') } : null;
  });
}

test('clicks make a closed triangle; the pen goes off after it', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.locator('.viewport').focus();
  await page.keyboard.press('p');
  await expect(page.getByTestId('sketch-hint')).toContainText('Pen');
  await click(page, 300, 300);
  await click(page, 500, 300);
  await click(page, 400, 450);
  await expect(page.getByTestId('pen-preview').locator('rect')).toHaveCount(3);
  await click(page, 300, 300);
  const s = await selected(page);
  expect(s).toEqual({ tag: 'path', d: 'M 300 300 L 500 300 L 400 450 Z' });
  await expect(page.getByTestId('sketch-hint')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a drag makes a smooth point; Enter ends an open path', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('pen.tool'));
  await click(page, 250, 400);
  await at(page, 400, 400);
  await page.mouse.down();
  await at(page, 450, 350);
  await page.mouse.up();
  await click(page, 550, 400);
  await page.keyboard.press('Enter');
  await frames(page);
  const s = await selected(page);
  expect(s!.d).toBe('M 250 400 C 250 400 350 450 400 400 C 450 350 550 400 550 400');
});

test('a press on the end of the selected open path goes on with it', async ({ page }) => {
  await setup(page, '<path id="p" d="M 200 200 L 300 200" fill="none" stroke="#000"/>');
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const el = [...doc.assets.get('pen.svg')!.svg!.root.querySelectorAll('path')][0];
    h.store()!.selection.set([doc.refOf(el)!]);
  });
  await page.evaluate(() => window.__appIconic!.run('pen.tool'));
  await click(page, 300, 200);
  await click(page, 300, 300);
  await page.keyboard.press('Escape');
  await frames(page);
  const s = await selected(page);
  expect(s!.d).toBe('M 200 200 L 300 200 L 300 300');
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Edit Path',
  );
});
