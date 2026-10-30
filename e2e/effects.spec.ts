import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, waitForCanvas } from './canvas-helpers';
import { frames } from './selection-helpers';

/** Prompt 076 – effects in the panel, masks like clip paths. */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="r" x="200" y="200" width="400" height="400" fill="#c33"/>' +
  '<circle id="c" cx="400" cy="400" r="150" fill="#fff"/></svg>';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'fx.svg', SVG);
}

const select = (page: Page, ...ids: string[]) =>
  page.evaluate((ids) => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const refs = ids.flatMap((id) => {
      for (const a of doc.assets.values()) {
        const el = a.svg?.root.querySelector(`[id="${id}"]`);
        if (el) return [doc.refOf(el)!];
      }
      return [];
    });
    h.store()!.select(refs);
  }, ids);

const filterEffects = (page: Page) =>
  page.evaluate(() => {
    const h = window.__appIconic!;
    const root = [...h.store()!.document().assets.values()].find((a) =>
      a.svg?.root.querySelector('[id="r"]'),
    )!.svg!.root;
    const f = root.querySelector('filter');
    return f ? JSON.parse(f.getAttribute('data-effects')!) : null;
  });

test('a drop shadow from the panel; dragging its offset is one undo step', async ({ page }) => {
  const errors = collectErrors(page);
  await setup(page);
  await select(page, 'r');
  const section = page.getByTestId('effects-section');
  await section.getByTestId('effect-dropShadow').check();
  await expect.poll(() => filterEffects(page)).toMatchObject([{ kind: 'dropShadow', dy: 8 }]);
  // drag the label "Y" of the shadow to the right: a live gesture
  const label = section.locator('[data-effect="dropShadow"] label[for="fx-dropShadow-dy"]');
  const box = (await label.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 4 + i * 4, box.y + box.height / 2);
  await page.mouse.up();
  await frames(page);
  const dy = (await filterEffects(page))[0].dy;
  expect(dy).toBeGreaterThan(8);
  expect(await page.evaluate(() => window.__appIconic!.store()!.undoLabel())).toBe(
    'Undo Change Effects',
  );
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await expect.poll(() => filterEffects(page)).toMatchObject([{ kind: 'dropShadow', dy: 8 }]);
  // off again: no filter left
  await section.getByTestId('effect-dropShadow').uncheck();
  await expect.poll(() => filterEffects(page)).toBeNull();
  expect(errors).toEqual([]);
});

test('a mask from two elements; luminance / alpha; release', async ({ page }) => {
  await setup(page);
  await select(page, 'r', 'c');
  await page.evaluate(() => window.__appIconic!.run('mask.create'));
  const masked = () =>
    page.evaluate(() => {
      const h = window.__appIconic!;
      const el = h.store()!.document().node(h.store()!.selection()[0]);
      return el ? [el.localName, el.getAttribute('mask')] : null;
    });
  await expect.poll(masked).toEqual(['g', 'url(#mask-1)']);
  const section = page.getByTestId('effects-section');
  await section.locator('[data-option="alpha"]').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...window.__appIconic!.store()!.document().assets.values()]
          .map((a) => a.svg?.root.querySelector('mask')?.getAttribute('mask-type'))
          .find(Boolean),
      ),
    )
    .toBe('alpha');
  await section.getByRole('button', { name: 'Release Mask' }).click();
  await expect.poll(masked).toEqual(['g', null]);
  await page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await expect.poll(masked).toEqual(['g', 'url(#mask-1)']);
});
