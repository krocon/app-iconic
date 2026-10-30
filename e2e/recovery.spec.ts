import { expect, Page, test } from '@playwright/test';

/**
 * Recovery after a crash (prompt 083): with a short interval in the stored settings a changed
 * document gets a snapshot; a reload is the crash (the browser mode keeps the snapshots in
 * localStorage, every page load is a new app instance). At start the offer lists it; Restore
 * shows the change in a changed document with the original path; saving removes the snapshot.
 */

const SETTINGS = 'appIconic.settings';
const RECOVERY = 'appIconic.recovery';

async function startWithRecovery(page: Page) {
  await page.goto('/');
  await page.evaluate(
    ([settings, recovery]) => {
      localStorage.removeItem(recovery);
      localStorage.setItem(
        settings,
        JSON.stringify({ startup: 'emptyDocument', recovery: { interval: 1 } }),
      );
    },
    [SETTINGS, RECOVERY],
  );
  await page.reload();
  await expect(page.getByTestId('doc-title')).toContainText('Untitled');
}

/** Sets `opacity` on the root of the first asset (undoable, through the store). */
async function change(page: Page, value: string) {
  await page.evaluate((v) => {
    const h = window.__appIconic!;
    const asset = [...h.store()!.document().assets.keys()][0];
    h.setAttribute(asset, h.rootId(asset)!, 'opacity', v);
  }, value);
}

const snapshots = (page: Page) => page.evaluate(() => window.__appIconic!.recovery.snapshots.size);

test.afterEach(async ({ page }) => {
  await page.evaluate(
    ([settings, recovery]) => {
      localStorage.removeItem(settings);
      localStorage.removeItem(recovery);
    },
    [SETTINGS, RECOVERY],
  );
});

test('a crash with unsaved changes: offered at start, restored with its path, saved away', async ({
  page,
}) => {
  await startWithRecovery(page);
  expect(await page.evaluate(() => window.__appIconic!.run('file.open'))).toBe(true);
  await expect(page.getByTestId('doc-title')).toContainText('camscanner.icon');
  await change(page, '0.5');
  await expect.poll(() => snapshots(page)).toBe(1);

  // "kill -9": no closing, no cleaning up
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Recover Unsaved Documents' });
  await expect(dialog).toBeVisible();
  const restore = dialog.getByRole('button', { name: 'Restore camscanner.icon' });
  await expect(restore).toBeFocused();
  await expect(dialog.getByTestId('recovery-entry')).toHaveCount(1);
  await restore.click();
  await expect(dialog).toBeHidden();

  await expect(page.getByTestId('doc-title')).toContainText('camscanner.icon');
  const state = await page.evaluate(() => {
    const h = window.__appIconic!;
    const doc = h.store()!.document();
    const asset = [...doc.assets.keys()][0];
    return { path: doc.path, dirty: h.store()!.dirty(), text: h.assetText(asset) };
  });
  expect(state.path).toBe('/fixtures/camscanner.icon');
  expect(state.dirty).toBe(true);
  expect(state.text).toContain('opacity="0.5"');
  // the change is on the canvas
  await expect
    .poll(() =>
      page
        .locator('app-canvas-view .layer')
        .evaluateAll((layers) =>
          layers.some((l) => l.shadowRoot?.querySelector('[opacity="0.5"]') != null),
        ),
    )
    .toBe(true);

  // Save writes the original path; the snapshot goes
  expect(await page.evaluate(() => window.__appIconic!.run('file.save'))).toBe(true);
  await expect.poll(() => snapshots(page)).toBe(0);
  expect(
    await page.evaluate(() =>
      window.__appIconic!.fileAsset('/fixtures/camscanner.icon', 'logo-scanner 3.svg'),
    ),
  ).toContain('opacity="0.5"');
});

test('a never saved document: "Later" keeps it, File › Recover shows it, Discard removes it', async ({
  page,
}) => {
  await startWithRecovery(page);
  await change(page, '0.25');
  await expect.poll(() => snapshots(page)).toBe(1);
  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Recover Unsaved Documents' });
  await expect(dialog.getByTestId('recovery-entry')).toContainText('Untitled');
  await expect(dialog.getByTestId('recovery-entry')).toContainText('Never saved');
  await dialog.getByTestId('recovery-later').click();
  await expect(dialog).toBeHidden();
  expect(await snapshots(page)).toBe(1);

  expect(await page.evaluate(() => window.__appIconic!.run('file.recover'))).toBe(true);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Discard Untitled' }).click();
  await expect(dialog).toContainText('There are no unsaved documents to recover.');
  expect(await snapshots(page)).toBe(0);
  await expect(dialog.getByTestId('recovery-later')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
