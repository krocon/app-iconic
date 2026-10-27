import { expect, Page, test } from '@playwright/test';
import { collectErrors, waitForCanvas } from './canvas-helpers';

/**
 * Prompt 018 – AI control (Chromium, browser mode with fakes): the MCP tools run in the window
 * as a call over the bridge would (`window.__appIconic.mcp`, design 018 E19). The acceptance
 * path without Rust: background, a circle with a gradient, bounds measured by the browser, the
 * preview SVG, one undo step per AI call. The bridge itself is tested in Rust and end to end.
 */
test.use({ viewport: { width: 1440, height: 900 } });

type Result = Record<string, unknown> & { error?: { code: string; message: string } };

function mcp(page: Page, tool: string, args: Record<string, unknown> = {}): Promise<Result> {
  return page.evaluate(
    ([t, a]) => window.__appIconic!.mcp(t as string, a as Record<string, unknown>),
    [tool, args] as const,
  ) as Promise<Result>;
}

const GRADIENT =
  '<defs><radialGradient id="ai-grad"><stop offset="0" stop-color="#ffd54a"/>' +
  '<stop offset="1" stop-color="#ff5a1f"/></radialGradient></defs>';

test('an AI draws an icon step by step and every step is one undo step', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await waitForCanvas(page);

  const doc = await mcp(page, 'get_document');
  expect(doc).toMatchObject({ pristine: true, dirty: false });
  const rev0 = doc['revision'] as number;

  // 1. the background
  const bg = await mcp(page, 'run_action', {
    action: 'icon.setFill',
    args: { fill: { solid: 'srgb:0.10000,0.20000,0.60000,1.00000' } },
    expected_revision: rev0,
  });
  expect(bg).toMatchObject({ ran: true, undo: 'Undo AI: Change Background' });

  // 2. a gradient definition and a circle that uses it
  const asset = ((await mcp(page, 'get_document'))['assets'] as { name: string }[])[0].name;
  const def = await mcp(page, 'run_command', {
    command: {
      type: 'insertDefinition',
      asset,
      markup: GRADIENT.replace(/<\/?defs>/g, ''),
      label: 'insertNode',
    },
  });
  expect(def.error).toBeUndefined();
  const circle = await mcp(page, 'run_action', {
    action: 'add.circle',
    args: { cx: 512, cy: 512, r: 300, fill: 'url(#ai-grad)' },
    expected_revision: def['revision'],
  });
  expect(circle).toMatchObject({ ran: true, undo: 'Undo AI: Add Circle' });
  const ref = (circle['selection'] as { asset: string; id: string }[])[0];

  // the browser measures the circle in icon units
  const node = await mcp(page, 'get_node', { node: ref });
  expect(node).toMatchObject({ tag: 'circle' });
  const box = node['bbox'] as { x: number; y: number; width: number; height: number };
  expect(box.x).toBeCloseTo(212, 1);
  expect(box.width).toBeCloseTo(600, 1);
  expect((node['attributes'] as Record<string, string>)['fill']).toBe('url(#ai-grad)');

  // the tree shows it, the stale revision is refused
  const tree = await mcp(page, 'get_tree');
  expect((tree['nodes'] as { tag?: string }[]).some((n) => n.tag === 'circle')).toBe(true);
  const stale = await mcp(page, 'run_action', {
    action: 'add.rect',
    expected_revision: rev0,
  });
  expect(stale.error?.code).toBe('revision_conflict');

  // the preview is the export SVG of the icon
  const preview = await mcp(page, 'preview_svg', { appearance: 'light', mask: 'squircle' });
  expect(preview['svg']).toContain('ai-grad');

  // the header names the AI's step; ⌘Z takes back one AI call at a time
  await expect(page.locator('.undo')).toHaveAttribute('aria-label', 'Undo AI: Add Circle');
  const undo = () => page.evaluate(() => window.__appIconic!.run('edit.undo'));
  await undo();
  expect(await mcp(page, 'get_node', { node: ref })).toMatchObject({
    error: { code: 'invalid_request' },
  });
  await expect(page.locator('.undo')).toHaveAttribute('aria-label', 'Undo AI: Insert Node');
  await undo();
  await undo();
  const back = await mcp(page, 'get_document');
  expect(back).toMatchObject({ dirty: false });
  expect(back['undo']).toBeNull();
  expect(errors).toEqual([]);
});

test('the AI may not quit, save behind the user or use the clipboard', async ({ page }) => {
  await page.goto('/');
  await waitForCanvas(page);
  for (const action of ['app.quit', 'file.saveAs', 'edit.copy', 'settings.reset']) {
    expect((await mcp(page, 'run_action', { action })).error?.code).toBe('unavailable');
  }
  const list = (await mcp(page, 'list_actions'))['actions'] as { id: string }[];
  expect(list.map((a) => a.id)).toContain('add.circle');
  expect(list.map((a) => a.id)).not.toContain('app.quit');
});
