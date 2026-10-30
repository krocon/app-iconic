import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { collectErrors, toClient, waitForCanvas } from './canvas-helpers';
import { menu } from './menu-helpers';
import { frames, snapping } from './selection-helpers';

/**
 * Prompt 031 – hardening in Chromium (browser mode): a big SVG (≥ 5 MB, ≥ 20 000 shapes) stays
 * usable – import, zoom/pan, selection, a snapping drag, the virtualised tree – with the numbers in
 * the test log (docs/architecture.md "Performance"); an SVG nested deeper than the browser's parser
 * allows is refused cleanly and the app keeps working.
 */
test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(180_000);

async function importText(page: Page, name: string, text: string) {
  await page.evaluate(
    ([name, text]) => window.__appIconic!.addSvgFile(`/in/${name}`, name, text),
    [name, text],
  );
  await menu(page, 'File', 'Import SVG…');
}

/** Average milliseconds per frame of `steps` view changes. */
function zoomPanFrame(page: Page, steps = 30): Promise<number> {
  return page.evaluate(async (steps) => {
    const c = window.__appIconic!.canvas;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    await frame();
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      c.zoomBy(i % 2 ? 1.05 : 0.97, { x: 300, y: 300 });
      await frame();
      c.panBy(3, -2);
      await frame();
    }
    return (performance.now() - t0) / (2 * steps);
  }, steps);
}

for (const plain of [false, true]) {
  const variant = plain ? 'plain' : 'with opacity';
  test(`a big SVG (≥ 5 MB, ≥ 20 000 shapes, ${variant}) stays usable`, async ({ page }) => {
    const errors = collectErrors(page);
    // the generator is an ES module with a CLI (Playwright compiles the tests to CommonJS)
    const text = execFileSync('node', ['scripts/big-svg.mjs', ...(plain ? ['--plain'] : [])], {
      encoding: 'utf8',
      maxBuffer: 64 << 20,
    });
    await page.goto('/');
    await waitForCanvas(page);
    const t0 = Date.now();
    await importText(page, 'big.svg', text);
    await expect(page.getByRole('tree')).toContainText('big');
    await frames(page, 3);
    const importMs = Date.now() - t0;

    const frameMs = await zoomPanFrame(page);

    // the hierarchy draws only what is visible
    const big = page.getByRole('treeitem', { name: /big/ }).first();
    await big.click();
    await page.keyboard.press('ArrowRight');
    await frames(page);
    const rows = await page.getByRole('treeitem').count();

    // select a shape with a click, then drag it with Magic Snap and the grid on
    await snapping(page, true, true);
    const t1 = performance.now();
    const c = await toClient(page, 512, 512);
    await page.mouse.click(c.clientX, c.clientY);
    await frames(page);
    const clickMs = performance.now() - t1;
    const selected = await page.evaluate(() => window.__appIconic!.store()!.selection().length);
    const t2 = Date.now();
    await page.mouse.move(c.clientX, c.clientY);
    await page.mouse.down();
    // the first step collects the snap candidates once per gesture (prompt 033): logged apart
    let firstStepMs = 0;
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(c.clientX + i * 3, c.clientY + i * 2);
      await frames(page, 1);
      if (i === 1) firstStepMs = Date.now() - t2;
    }
    const restMs = (Date.now() - t2 - firstStepMs) / 19;
    await page.mouse.up();
    await frames(page);
    const dragFrameMs = (Date.now() - t2) / 20;

    console.log(
      `big.svg ${variant} ${(text.length / 1024 / 1024).toFixed(1)} MB: import ${importMs} ms, zoom/pan ` +
        `${frameMs.toFixed(1)} ms/frame, tree rows ${rows}, click ${clickMs.toFixed(0)} ms, ` +
        `drag with snap ${dragFrameMs.toFixed(1)} ms/step (first ${firstStepMs} ms, then ` +
        `${restMs.toFixed(1)} ms/step; selected ${selected})`,
    );
    // regression guards: headless Chromium rasters in software – the numbers of a real machine
    // with a GPU are in docs/architecture.md "Performance"
    expect(importMs).toBeLessThan(30_000);
    expect(frameMs).toBeLessThan(2_000);
    expect(dragFrameMs).toBeLessThan(3_000);
    expect(rows).toBeLessThan(500); // of > 20 000
    expect(selected).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test('an SVG nested deeper than the parser allows is refused; the app keeps working', async ({
  page,
}) => {
  await page.goto('/');
  await waitForCanvas(page);
  const deep =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<g>'.repeat(5_000) +
    '<rect width="1" height="1"/>' +
    '</g>'.repeat(5_000) +
    '</svg>';
  await importText(page, 'deep.svg', deep);
  // a clean error, no crash
  const alert = page.getByRole('alertdialog');
  await expect(alert).toContainText('The SVG could not be imported.');
  await alert.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('tree')).not.toContainText('deep');
  // still usable: the next import works and a shape can be added to it
  await importText(
    page,
    'fine.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle r="10"/></svg>',
  );
  await expect(page.getByRole('tree')).toContainText('fine');
  expect(await page.evaluate(() => window.__appIconic!.run('add.rect'))).toBe(true);
  await frames(page, 3);
  expect(await page.evaluate(() => window.__appIconic!.store()!.selection().length)).toBe(1);
});
