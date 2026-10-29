import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 045 – Live Corners like VectorCraft (Chromium, browser mode). */
test.use({ viewport: { width: 1440, height: 900 } });

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

async function setup(page: Page, body: string, zoom = 1) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'c.svg', svg(body));
  await snapping(page, false);
  await centerOn(page, zoom, { x: 400, y: 400 });
  await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const el = doc.assets.get('c.svg')!.svg!.root.lastElementChild!;
    h.store()!.selection.set([doc.refOf(el)!]);
  });
  await frames(page, 2);
}

function selected(page: Page) {
  return page.evaluate(() => {
    const h = window.__appIconic!;
    const el = h.store()!.document().node(h.store()!.selection()[0]);
    return el
      ? {
          tag: el.localName,
          attrs: Object.fromEntries([...el.attributes].map((a) => [a.name, a.value])),
        }
      : null;
  });
}

for (const zoom of [0.5, 1.5]) {
  test(`a rectangle's corners round with a drag of a widget (zoom ${zoom * 100} %)`, async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await setup(page, '<rect x="300" y="300" width="200" height="160" fill="#08f"/>', zoom);
    const widgets = page.getByTestId('corner-widget');
    await expect(widgets).toHaveCount(4);
    const box = (await widgets.first().boundingBox())!;
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // the top left widget towards the centre: 30 document units along each axis = r 30
    const a = await toClient(page, 300, 300);
    const b = await toClient(page, 330, 330);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + (b.clientX - a.clientX), from.y + (b.clientY - a.clientY), {
      steps: 6,
    });
    await page.mouse.up();
    await frames(page);
    const s = await selected(page);
    expect(s?.tag).toBe('rect');
    expect(Number(s!.attrs['rx'])).toBeGreaterThan(20);
    expect(s!.attrs['rx']).toBe(s!.attrs['ry']);
    expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
      'Undo Round Corners',
    );
    expect(errors).toEqual([]);
  });
}

test('a polygon: Alt-click cycles the kind; double-click opens Corners…', async ({ page }) => {
  await setup(page, '<polygon points="300,300 500,300 400,480" fill="#f80"/>');
  const widgets = page.getByTestId('corner-widget');
  await expect(widgets).toHaveCount(3);
  await page.keyboard.down('Alt');
  await widgets.first().click();
  await page.keyboard.up('Alt');
  await frames(page);
  // a path now (inverted round with radius 0 is the same outline)
  let s = await selected(page);
  expect(s?.tag).toBe('path');
  await expect(widgets).toHaveCount(3);
  await widgets.first().dblclick();
  const dialog = page.getByRole('dialog', { name: 'Corners' });
  await expect(dialog).toBeVisible();
  await page.getByTestId('corners-radius').fill('20');
  await page.getByTestId('corners-kind').selectOption('chamfer');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  s = await selected(page);
  expect(s!.attrs['d'].match(/L/g)!.length).toBe(5);
  expect(s!.attrs['fill']).toBe('#f80');
});
