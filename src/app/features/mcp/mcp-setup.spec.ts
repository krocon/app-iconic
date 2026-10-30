import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FAKE_CLIENT_PATHS } from '../../../testing/fake-mcp-api';
import { OS } from '../../core/actions/platform';
import { McpSetup } from './mcp-setup';
import { McpStore } from './mcp.store';
import { DestroyRef } from '@angular/core';

const SIDE = '/opt/AppIconic/app-iconic-mcp';
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('McpSetup (prompt 086)', () => {
  let backend: ReturnType<typeof fakeBackend>;

  beforeEach(() => {
    backend = fakeBackend();
    backend.mcp.infoValue = { enabled: true, connections: 0, sidecar: SIDE, debug: false };
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    TestBed.inject(McpStore).start(TestBed.inject(DestroyRef));
  });

  async function render() {
    const f = TestBed.createComponent(McpSetup);
    await tick();
    await TestBed.inject(McpStore).refresh();
    f.detectChanges();
    await tick();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const q = (id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const step = async () => {
      await tick();
      f.detectChanges();
      await tick();
      f.detectChanges();
    };
    return { f, el, q, step };
  }

  it('shows the state, previews the change as a diff and writes only after Apply', async () => {
    backend.mcp.files.claudeDesktop =
      '{\n  "mcpServers": {\n    "fs": { "command": "npx" }\n  }\n}\n';
    const { q, step } = await render();
    expect(q('mcp-client-state')!.textContent).toContain('Not set up.');
    expect(q('mcp-client-path')!.textContent).toBe(FAKE_CLIENT_PATHS.claudeDesktop);
    q('mcp-setup-install')!.click();
    await step();
    const diff = q('mcp-setup-diff')!.textContent!;
    expect(diff).toMatch(/\+\s+"app-iconic"/);
    expect(diff).toContain(SIDE);
    expect(backend.mcp.files.claudeDesktop).not.toContain('app-iconic');
    q('mcp-setup-apply')!.click();
    await step();
    const written = JSON.parse(backend.mcp.files.claudeDesktop!);
    expect(written.mcpServers.fs).toEqual({ command: 'npx' });
    expect(written.mcpServers['app-iconic']).toEqual({ command: SIDE });
    expect(q('mcp-setup-result')!.textContent).toContain('restart Claude Desktop');
    expect(q('mcp-setup-result')!.textContent).toContain('Backup:');
    expect(backend.mcp.backups).toHaveLength(1);
    expect(q('mcp-client-state')!.textContent).toContain('Set up for this AppIconic.');
    // and remove again
    q('mcp-setup-remove')!.click();
    await step();
    expect(q('mcp-setup-diff')!.textContent).toContain('− ');
    q('mcp-setup-apply')!.click();
    await step();
    expect(JSON.parse(backend.mcp.files.claudeDesktop!).mcpServers).toEqual({
      fs: { command: 'npx' },
    });
  });

  it('Cursor gets type stdio; a new file needs no backup', async () => {
    const { el, q, step } = await render();
    el.querySelector<HTMLInputElement>('[data-testid="mcp-target-cursor"]')!.click();
    await step();
    expect(q('mcp-client-path')!.textContent).toBe(FAKE_CLIENT_PATHS.cursor);
    expect(q('mcp-client-state')!.textContent).toContain('does not exist yet');
    q('mcp-setup-install')!.click();
    await step();
    q('mcp-setup-apply')!.click();
    await step();
    expect(JSON.parse(backend.mcp.files.cursor!).mcpServers['app-iconic']).toEqual({
      type: 'stdio',
      command: SIDE,
    });
    expect(q('mcp-setup-result')!.textContent).not.toContain('Backup:');
  });

  it('a file with comments is reported and never written', async () => {
    const bad = '{\n  // mine\n  "mcpServers": {}\n}\n';
    backend.mcp.files.claudeDesktop = bad;
    const { q, step } = await render();
    expect(q('mcp-client-state')!.textContent).toContain('not plain JSON');
    expect((q('mcp-setup-install') as HTMLButtonElement).disabled).toBe(true);
    // even when asked directly
    await expect(backend.mcp.preview('claudeDesktop', false)).rejects.toMatchObject({
      code: 'invalid_config',
    });
    await step();
    expect(backend.mcp.files.claudeDesktop).toBe(bad);
  });

  it('a file changed after the preview gets a new preview, not a blind write', async () => {
    const { q, step } = await render();
    q('mcp-setup-install')!.click();
    await step();
    backend.mcp.files.claudeDesktop = '{ "mcpServers": { "new": { "command": "x" } } }';
    q('mcp-setup-apply')!.click();
    await step();
    expect(q('mcp-setup-result')!.textContent).toContain('changed in the meantime');
    expect(q('mcp-setup-diff')!.textContent).toContain('"new"');
    expect(backend.mcp.files.claudeDesktop).not.toContain('app-iconic');
  });

  it('shows the Claude Code line and the connection test', async () => {
    const { q, step } = await render();
    expect(q('settings-mcp-command')!.textContent).toBe(`claude mcp add app-iconic -- "${SIDE}"`);
    q('mcp-test')!.click();
    await step();
    expect(q('mcp-test-result')!.textContent).toContain(
      'Connection works: app-iconic 0.1.0, 20 tools, 1 document.',
    );
    backend.mcp.probeValue = {
      ...backend.mcp.probeValue,
      ok: false,
      app: false,
      code: 'not_running',
    };
    q('mcp-test')!.click();
    await step();
    expect(q('mcp-test-result')!.textContent).toContain('turn on');
    backend.mcp.probeValue = { ...backend.mcp.probeValue, step: 'initialize', code: 'timeout' };
    q('mcp-test')!.click();
    await step();
    expect(q('mcp-test-result')!.textContent).toContain('did not answer in time');
  });

  it('without the sidecar it says how to get it', async () => {
    backend.mcp.infoValue = { enabled: true, connections: 0, sidecar: null, debug: true };
    const { q } = await render();
    expect(q('mcp-no-sidecar')!.textContent).toContain('pnpm mcp:sidecar:dev');
    expect(q('mcp-setup-install')).toBeNull();
    expect(q('mcp-test')).toBeNull();
  });
});
