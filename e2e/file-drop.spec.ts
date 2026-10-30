import { expect, Page, test } from '@playwright/test';
import { collectErrors, importSvg, toClient, waitForCanvas } from './canvas-helpers';
import { centerOn, frames, snapping } from './selection-helpers';

/** Prompt 071 – files dropped from the system, images from the clipboard (Chromium, fake drop). */
test.use({ viewport: { width: 1440, height: 900 } });

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">' +
  '<rect id="a" x="100" y="100" width="200" height="200" fill="#c33"/></svg>';
const DROPPED =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect id="d" width="40" height="20" fill="#3c3"/></svg>';
// PNG bytes for the fake file (only the data URL is stored)
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwnwEIGBgAHu4D/WeYqC0AAAAASUVORK5CYII=';

async function setup(page: Page) {
  await page.goto('/');
  await waitForCanvas(page);
  await importSvg(page, 'drop.svg', SVG);
  await snapping(page, false);
  await centerOn(page, 1, { x: 400, y: 400 });
  await page.evaluate(() => window.__appIconic!.store()!.selection.set([]));
}

const bounds = (page: Page, id: string) =>
  page.evaluate((id) => {
    const h = window.__appIconic!;
    for (const [name, a] of h.store()!.document().assets) {
      const el = a.svg?.root.querySelector(`[id="${id}"]`);
      if (el) return h.nodeBounds(name, el.getAttribute('data-ai-id')!);
    }
    return null;
  }, id);

test('an SVG dropped on the canvas lands at the drop point; a hint shows while dragging', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await setup(page);
  await page.evaluate((text) => {
    window.__appIconic!.files.svgFiles.set('/drop/d.svg', { name: 'd.svg', text });
  }, DROPPED);
  const c = await toClient(page, 500, 300);
  const files = [{ path: '/drop/d.svg', kind: 'svg' }];
  await page.evaluate(
    ({ files, c }) =>
      window.__appIconic!.dropFiles(files as never, c.clientX, c.clientY, ['enter', 'over']),
    { files, c },
  );
  await expect(page.getByTestId('drop-mark')).toHaveAttribute('data-kind', 'insert');
  await expect(page.getByTestId('drop-mark')).toContainText('Insert here');
  await page.evaluate(
    ({ files, c }) => window.__appIconic!.dropFiles(files as never, c.clientX, c.clientY, ['drop']),
    { files, c },
  );
  await expect(page.getByTestId('drop-hint')).toHaveCount(0);
  await expect.poll(() => bounds(page, 'd')).not.toBeNull();
  const b = (await bounds(page, 'd'))!;
  expect(b.x + b.width / 2).toBeCloseTo(500, 0);
  expect(b.y + b.height / 2).toBeCloseTo(300, 0);
  expect(errors).toEqual([]);
});

test('an image dropped on the canvas becomes an <image>; an SVG over the panel a new layer', async ({
  page,
}) => {
  await setup(page);
  await page.evaluate((png) => {
    const h = window.__appIconic!;
    h.addImageFile('/drop/i.png', {
      name: 'i.png',
      mime: 'image/png',
      dataUrl: `data:image/png;base64,${png}`,
      width: 2,
      height: 1,
    });
  }, PNG);
  const c = await toClient(page, 300, 600);
  await page.evaluate(
    (c) =>
      window.__appIconic!.dropFiles([{ path: '/drop/i.png', kind: 'image' }], c.clientX, c.clientY),
    c,
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const img = [...window.__appIconic!.store()!.document().assets.values()]
          .map((a) => a.svg?.root.querySelector('image'))
          .find(Boolean);
        return img
          ? [img.getAttribute('x'), img.getAttribute('y'), img.getAttribute('width')]
          : null;
      }),
    )
    .toEqual(['299', '599.5', '2']);
  // an SVG dropped over the layer panel: "Import SVG" as a new group
  const groups = () =>
    page.evaluate(
      () => (window.__appIconic!.store()!.document().iconJson['groups'] as unknown[]).length,
    );
  const before = await groups();
  await page.evaluate((text) => {
    window.__appIconic!.files.svgFiles.set('/drop/e.svg', { name: 'e.svg', text });
  }, DROPPED);
  const panel = (await page.locator('app-hierarchy-tree').boundingBox())!;
  await page.evaluate(
    (p) =>
      window.__appIconic!.dropFiles([{ path: '/drop/e.svg', kind: 'svg' }], p.x + 40, p.y + 40),
    panel,
  );
  await expect.poll(groups).toBe(before + 1);
  // unknown files are reported
  await page.evaluate(() =>
    window.__appIconic!.dropFiles([{ path: '/drop/x.pdf', kind: 'other' }], 20, 20),
  );
  await expect(
    page.locator('.notice, [role="status"]').filter({ hasText: 'not added' }).first(),
  ).toBeVisible();
});

test('⌘V pastes a copied image when the clipboard holds no SVG', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setup(page);
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 2;
    canvas.getContext('2d')!.fillRect(0, 0, 3, 2);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });
  await page.evaluate(() => window.__appIconic!.run('edit.paste'));
  await frames(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...window.__appIconic!.store()!.document().assets.values()].some(
          (a) => a.svg?.root.querySelector('image[href^="data:image/png"][width="3"]') != null,
        ),
      ),
    )
    .toBe(true);
});
