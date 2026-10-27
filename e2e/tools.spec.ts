import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { close } from './selection-helpers';

/**
 * Prompt 013 – tools (Chromium, browser mode with fakes): a freehand stroke drawn with the mouse
 * becomes one path (one undo step), Esc cancels the stroke and then ends the tool; a symbol is
 * found and added centred; text to path (fake fonts) adds a centred path.
 */
test.use({ viewport: { width: 1440, height: 900 } });

const A = 'tools.svg';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="bg" x="0" y="0" width="10" height="10" fill="#eee"/></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, A, SVG);
}

function sidebarItem(page: Page, id: string) {
  return page.locator(`app-command-sidebar [data-action="${id}"]`);
}

/** Number of `<path>` elements in the imported asset. */
function pathCount(page: Page) {
  return page.evaluate(
    (a) =>
      window.__appIconic!.store()!.document().asset(a)!.svg!.root.querySelectorAll('path').length,
    A,
  );
}

function selected(page: Page) {
  return page.evaluate(() => {
    const h = window.__appIconic!;
    const ref = h.store()!.selection()[0];
    if (!ref) return null;
    const el = h.store()!.document().node(ref)!;
    const b = h.nodeBounds(ref.asset, ref.id);
    return {
      tag: el.localName,
      d: el.getAttribute('d'),
      stroke: el.getAttribute('stroke'),
      fill: el.getAttribute('fill'),
      transform: el.getAttribute('transform'),
      children: Array.from(el.children).map((c) => c.localName),
      center: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null,
    };
  });
}

function visibleCenter(page: Page) {
  return page.evaluate(() => {
    const c = window.__appIconic!.canvas;
    const vp = c.viewport();
    return c.toDocument({ x: vp.width / 2, y: vp.height / 2 });
  });
}

/** A wave from document (300, 400) to (700, 400), drawn with the mouse. */
async function stroke(page: Page, opts: { release?: boolean; before?: () => Promise<void> } = {}) {
  const start = await toClient(page, 300, 400);
  await page.mouse.move(start.clientX, start.clientY);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) {
    const p = await toClient(page, 300 + i * 10, 400 + Math.sin(i / 4) * 60);
    await page.mouse.move(p.clientX, p.clientY);
    await page.waitForTimeout(9);
  }
  await opts.before?.();
  if (opts.release !== false) await page.mouse.up();
}

test('freehand: a mouse stroke becomes one stroked path, one undo removes it', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  const before = await pathCount(page);
  await sidebarItem(page, 'add.freehand').click();
  await expect(page.getByTestId('tool-hint')).toBeVisible();
  await expect(page.getByTestId('freehand-options')).toBeVisible();
  await stroke(page, {
    before: async () =>
      // the live preview while drawing
      expect(page.getByTestId('freehand-preview').locator('path')).toHaveCount(1),
  });
  await expect.poll(() => pathCount(page)).toBe(before + 1);
  const s = (await selected(page))!;
  expect(s.tag).toBe('path');
  expect(s.stroke).toBe('#000000');
  expect(s.fill).toBe('none');
  expect(s.d).toMatch(/^M 30\d(\.\d)? 40\d(\.\d)? C/);
  expect(s.d!.split('C').length - 1).toBeGreaterThan(3);
  expect(s.d!.endsWith('Z')).toBe(false);
  await expect(page.getByTestId('freehand-preview')).toHaveCount(0);
  // the tool stays on; one undo removes the stroke
  await expect(page.getByTestId('tool-hint')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect.poll(() => pathCount(page)).toBe(before);
  expect(errors).toEqual([]);
});

test('freehand: Esc cancels the stroke, a second Esc ends the tool', async ({ page }) => {
  await setup(page);
  const before = await pathCount(page);
  await page.evaluate(() => window.__appIconic!.run('add.freehand'));
  await stroke(page, { release: false });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));
  expect(await pathCount(page)).toBe(before);
  await expect(page.getByTestId('tool-hint')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tool-hint')).toHaveCount(0);
  // without the tool a drag selects again (no path)
  await stroke(page);
  expect(await pathCount(page)).toBe(before);
});

test('freehand: C closes the stroke', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.__appIconic!.run('add.freehand'));
  await page.locator('.viewport').focus();
  await page.keyboard.press('c');
  await expect(page.getByTestId('freehand-closed')).toBeChecked();
  await stroke(page);
  await expect.poll(async () => (await selected(page))?.d?.endsWith('Z')).toBe(true);
});

test('symbol: search, Enter adds the group centred in the visible area', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await sidebarItem(page, 'add.symbol').click();
  const search = page.getByTestId('symbol-search');
  await expect(search).toBeFocused();
  await expect(page.locator('[data-testid="symbol-grid"] [role="option"]').first()).toBeVisible();
  await search.fill('heart');
  await expect(page.locator('[data-symbol="heart"]')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('symbol-size').fill('300');
  await page.getByTestId('symbol-size').dispatchEvent('change');
  await search.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await selected(page))?.tag).toBe('g');
  const s = (await selected(page))!;
  expect(s.children.length).toBeGreaterThan(0);
  expect(s.children.every((c) => c === 'path')).toBe(true);
  expect(s.transform).toMatch(/scale\(12\.5\)$/);
  // the heart's box is centred, the drawn heart lies around the centre
  close(s.center!, await visibleCenter(page), 40);
  expect(errors).toEqual([]);
});

test('text to path: the fake font adds one filled path centred', async ({ page }) => {
  await setup(page);
  await sidebarItem(page, 'add.textToPath').click();
  await page.getByTestId('text-path-text').fill('Hello');
  await expect(page.getByTestId('text-path-preview').locator('path')).toHaveCount(1);
  await page.getByTestId('text-path-add').click();
  await expect.poll(async () => (await selected(page))?.tag).toBe('path');
  const s = (await selected(page))!;
  expect(s.fill).toBe('#000000');
  close(s.center!, await visibleCenter(page), 0.6);
  // an emoji has no glyph: the error, no Add
  await sidebarItem(page, 'add.textToPath').click();
  await page.getByTestId('text-path-text').fill('😀');
  await expect(page.getByTestId('text-path-error')).toContainText('no shapes');
  await expect(page.getByTestId('text-path-add')).toBeDisabled();
});
