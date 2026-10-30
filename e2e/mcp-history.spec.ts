import { expect, Page, test } from '@playwright/test';
import { collectErrors, waitForCanvas } from './canvas-helpers';

/**
 * Prompt 086 – AI history and setting up AI apps (Chromium, browser mode with fakes): calls of
 * the AI appear in the popover at the “AI” badge, “Undo” takes back the last one; Settings › AI
 * control previews the change of Claude Desktop's configuration as a diff and writes it only
 * after “Apply”. The real files and the sidecar are tested in Rust and end to end (Xvfb).
 */
test.use({ viewport: { width: 1440, height: 900 } });

function mcp(page: Page, tool: string, args: Record<string, unknown> = {}) {
  return page.evaluate(
    ([t, a]) => window.__appIconic!.mcp(t as string, a as Record<string, unknown>),
    [tool, args] as const,
  ) as Promise<Record<string, unknown>>;
}

test('the AI history lists the calls and undoes the last one', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForCanvas(page);
  await expect(page.getByTestId('ai-badge')).toHaveCount(0);

  await mcp(page, 'get_tree');
  const r = await mcp(page, 'run_action', {
    action: 'add.circle',
    args: { cx: 512, cy: 512, r: 100 },
  });
  expect(r).toMatchObject({ ran: true });
  await mcp(page, 'run_action', { action: 'file.save' });

  const badge = page.getByTestId('ai-badge');
  await expect(badge).toBeVisible();
  await badge.click();
  const pop = page.locator('[data-popover]');
  await expect(pop).toBeVisible();
  const rows = pop.getByTestId('ai-history-entry');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('file.save');
  await expect(rows.nth(0)).toContainText('unavailable');
  await expect(rows.nth(1)).toContainText('add.circle');
  await expect(rows.nth(2)).toContainText('get_tree');
  // the popover is not modal: the canvas is still there to use
  await expect(page.locator('.backdrop.popover-host')).toHaveCount(1);

  const circle = rows.filter({ hasText: 'add.circle' });
  await expect(circle.getByTestId('ai-history-undo')).toBeVisible();
  await expect(page.locator('header .btn.undo')).toBeEnabled();
  await circle.getByTestId('ai-history-undo').click();
  await expect(circle.getByTestId('ai-history-undo')).toHaveCount(0);
  // the AI step was the only one: nothing left to undo
  await expect(page.locator('header .btn.undo')).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
  await expect(badge).toBeFocused();
  expect(errors).toEqual([]);
});

test('Settings › AI control sets up Claude Desktop after a preview', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForCanvas(page);
  await page.evaluate(() => {
    const api = window.__appIconic!.mcpApi;
    api.infoValue = {
      enabled: true,
      connections: 0,
      sidecar: '/opt/AppIconic/app-iconic-mcp',
      debug: false,
    };
    api.files.claudeDesktop = '{\n  "mcpServers": {\n    "fs": { "command": "npx" }\n  }\n}\n';
  });
  await page.evaluate(() => window.__appIconic!.run('app.settings'));
  await page.getByRole('tab', { name: /AI control/ }).click();
  await expect(page.getByTestId('mcp-client-state')).toContainText('Not set up.');
  await page.getByTestId('mcp-setup-install').click();
  const diff = page.getByTestId('mcp-setup-diff');
  await expect(diff).toContainText('"app-iconic"');
  await expect(diff).toContainText('/opt/AppIconic/app-iconic-mcp');
  expect(await page.evaluate(() => window.__appIconic!.mcpApi.files.claudeDesktop)).not.toContain(
    'app-iconic',
  );
  await page.getByTestId('mcp-setup-apply').click();
  await expect(page.getByTestId('mcp-setup-result')).toContainText('restart Claude Desktop');
  await expect(page.getByTestId('mcp-client-state')).toContainText('Set up for this AppIconic.');
  const written = await page.evaluate(() => window.__appIconic!.mcpApi.files.claudeDesktop!);
  expect(JSON.parse(written).mcpServers).toEqual({
    fs: { command: 'npx' },
    'app-iconic': { command: '/opt/AppIconic/app-iconic-mcp' },
  });
  await page.getByTestId('mcp-test').click();
  await expect(page.getByTestId('mcp-test-result')).toContainText('Connection works');
  expect(errors).toEqual([]);
});
