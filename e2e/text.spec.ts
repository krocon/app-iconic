import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 075 – live typography: place, edit on the canvas, choose a font, convert to a path. */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<g id="g" transform="translate(100 50) rotate(10)">' +
  '<text id="t" x="200" y="300" font-family="Fake Sans" font-size="80" fill="#c33">Icon</text></g></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'text.svg', SVG);
  await snapping(page, false);
  await centerOn(page, 1, { x: 450, y: 400 });
}

const texts = (page: Page) =>
  page.evaluate(() =>
    [...window.__appIconic!.store()!.document().assets.values()].flatMap((a) =>
      [...(a.svg?.root.querySelectorAll('text') ?? [])].map((t) =>
        [...t.childNodes].map((n) => n.textContent).join('|'),
      ),
    ),
  );

test('the text tool places text; a double click edits it on the canvas; undo', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.locator('.viewport').focus();
  await page.keyboard.press('Shift+T');
  await expect(page.getByTestId('tool-name')).toContainText('Text');
  const c = await toClient(page, 300, 600);
  await page.mouse.click(c.clientX, c.clientY);
  const editor = page.getByTestId('text-editor');
  await expect(editor).toBeFocused();
  await page.keyboard.type('Hello');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(editor).toHaveCount(0);
  await expect.poll(() => texts(page)).toContain('Hello');
  await page.keyboard.press('Escape');
  // double click the existing text: edit it, two lines
  await page.evaluate(() => window.__appIconic!.run('tool.select'));
  const t = await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    for (const [name, a] of doc.assets) {
      const el = a.svg?.root.querySelector('[id="t"]');
      if (el) return h.nodeBounds(name, el.getAttribute('data-ai-id')!);
    }
    return null;
  });
  const p = await toClient(page, t!.x + t!.width / 2, t!.y + t!.height / 2);
  await page.mouse.dblclick(p.clientX, p.clientY);
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Icon');
  await editor.fill('Big\nIcon');
  await editor.press('ControlOrMeta+Enter');
  await expect.poll(() => texts(page)).toContain('Big|Icon');
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Change Text',
  );
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await expect.poll(() => texts(page)).toContain('Icon');
  // Esc cancels without a step
  await page.mouse.dblclick(p.clientX, p.clientY);
  await expect(editor).toBeFocused();
  await editor.fill('nothing');
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  expect(await texts(page)).not.toContain('nothing');
  expect(errors).toEqual([]);
});

test('a font from the list; the text becomes a path where it was (zoom 150 %)', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    for (const a of doc.assets.values()) {
      const el = a.svg?.root.querySelector('[id="t"]');
      if (el) h.store()!.select([doc.refOf(el)!]);
    }
  });
  const font = page.locator('#prop-font-family');
  await font.focus();
  await expect(page.locator('#prop-font-family-fonts option')).toHaveCount(2);
  await font.fill('Fake Serif');
  await font.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = window.__appIconic!;
        return h.store()!.document().node(h.store()!.selection()[0])!.getAttribute('font-family');
      }),
    )
    .toBe('Fake Serif');
  await centerOn(page, 1.5, { x: 450, y: 400 });
  const bounds = () =>
    page.evaluate(() => {
      const h = window.__appIconic!;
      const r = h.store()!.selection()[0];
      return h.nodeBounds(r.asset, r.id);
    });
  const before = (await bounds())!;
  await page.evaluate(() => window.__appIconic!.run('text.toPath'));
  await expect
    .poll(() =>
      page.evaluate(() => {
        const h = window.__appIconic!;
        return h.store()!.document().node(h.store()!.selection()[0])?.localName;
      }),
    )
    .toBe('path');
  await frames(page);
  const after = (await bounds())!;
  // the fake font draws boxes of 0.6 em – the outlines sit where the text was, not glyph-exact
  const tol = 0.35 * 80;
  expect(Math.abs(after.x - before.x)).toBeLessThan(tol);
  expect(Math.abs(after.y + after.height - (before.y + before.height))).toBeLessThan(tol);
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Convert Text to Path',
  );
});
