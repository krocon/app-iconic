import { Injectable } from '@angular/core';
import { McpApi } from '../app/core/mcp/mcp-api';
import { FsError } from '../app/core/errors/fs-error';
import {
  McpCall,
  McpClientStatus,
  McpError,
  McpInfo,
  McpProbe,
  McpSetupDone,
  McpSetupPlan,
  McpTarget,
  NO_MCP,
} from '../app/core/mcp/mcp.models';

/** Where the fake keeps the client configurations (shown like Rust's paths). */
export const FAKE_CLIENT_PATHS: Record<McpTarget, string> = {
  claudeDesktop: '/home/you/.config/Claude/claude_desktop_config.json',
  cursor: '/home/you/.cursor/mcp.json',
};

const fsError = (code: FsError['code'], message: string): FsError => ({ code, message });

/** Plain JSON object with `mcpServers` as object – else `invalid_config` (like Rust). */
function parse(text: string | null): Record<string, unknown> {
  if (text === null || !text.trim()) return {};
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw fsError('invalid_config', 'not plain JSON');
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw fsError('invalid_config', 'not an object');
  }
  const servers = (v as Record<string, unknown>)['mcpServers'];
  if (
    servers !== undefined &&
    (typeof servers !== 'object' || servers === null || Array.isArray(servers))
  ) {
    throw fsError('invalid_config', 'mcpServers is not an object');
  }
  return v as Record<string, unknown>;
}

const render = (v: unknown) => JSON.stringify(v, null, 2) + '\n';

/** One answer the window gave. */
export interface FakeReply {
  callId: number;
  result: unknown;
  error: McpError | null;
}

/**
 * `McpApi` without a backend (tests, browser mode): `send` plays a tool call of the app, the
 * answers are kept in `replies`; `waitFor(callId)` resolves with the answer.
 */
@Injectable()
export class FakeMcpApi extends McpApi {
  infoValue: McpInfo = { ...NO_MCP };
  readyCount = 0;
  disconnects = 0;
  readonly replies: FakeReply[] = [];
  private callFn: ((c: McpCall) => void) | null = null;
  private statusFn: ((i: McpInfo) => void) | null = null;
  private waiting = new Map<number, (r: FakeReply) => void>();
  private nextId = 1;
  /** The configuration files of the clients (`null` = none). */
  readonly files: Record<McpTarget, string | null> = { claudeDesktop: null, cursor: null };
  /** Backups written (path → old text). */
  readonly backups: [string, string][] = [];
  probeValue: McpProbe = {
    ok: true,
    step: 'app',
    code: null,
    server: 'app-iconic',
    version: '0.1.0',
    protocol: '2025-06-18',
    tools: 20,
    app: true,
    documents: 1,
  };
  tests = 0;

  async info(): Promise<McpInfo> {
    return { ...this.infoValue };
  }

  async ready(): Promise<void> {
    this.readyCount++;
  }

  async reply(callId: number, result: unknown, error: McpError | null): Promise<void> {
    const r = { callId, result, error };
    this.replies.push(r);
    this.waiting.get(callId)?.(r);
    this.waiting.delete(callId);
  }

  async disconnect(): Promise<void> {
    this.disconnects++;
    this.setStatus({ ...this.infoValue, connections: 0 });
  }

  async onCall(fn: (c: McpCall) => void): Promise<() => void> {
    this.callFn = fn;
    return () => (this.callFn = null);
  }

  async onStatus(fn: (i: McpInfo) => void): Promise<() => void> {
    this.statusFn = fn;
    return () => (this.statusFn = null);
  }

  private missingSidecar(): void {
    if (!this.infoValue.sidecar) throw fsError('sidecar_missing', 'no sidecar');
  }

  private state(text: string | null): McpClientStatus['state'] {
    if (text === null) return 'absent';
    try {
      const e = (parse(text)['mcpServers'] as Record<string, { command?: unknown }> | undefined)?.[
        'app-iconic'
      ];
      if (!e) return 'missing';
      return e.command === this.infoValue.sidecar && this.infoValue.sidecar ? 'installed' : 'other';
    } catch {
      return 'invalid';
    }
  }

  async clients(): Promise<McpClientStatus[]> {
    return (['claudeDesktop', 'cursor'] as const).map((target) => ({
      target,
      path: FAKE_CLIENT_PATHS[target],
      state: this.state(this.files[target]),
    }));
  }

  private plan(target: McpTarget, remove: boolean): string | null {
    const before = this.files[target];
    const root = parse(before);
    const servers = (root['mcpServers'] ?? {}) as Record<string, Record<string, unknown>>;
    if (remove) {
      if (before === null || !servers['app-iconic']) return null;
      delete servers['app-iconic'];
      return render(root);
    }
    this.missingSidecar();
    const entry = { ...(servers['app-iconic'] ?? {}) };
    if (target === 'cursor') entry['type'] = 'stdio';
    entry['command'] = this.infoValue.sidecar;
    const next = render({ ...root, mcpServers: { ...servers, 'app-iconic': entry } });
    return before !== null && JSON.stringify(parse(before)) === JSON.stringify(parse(next))
      ? null
      : next;
  }

  async preview(target: McpTarget, remove: boolean): Promise<McpSetupPlan> {
    return {
      target,
      path: FAKE_CLIENT_PATHS[target],
      before: this.files[target],
      after: this.plan(target, remove),
    };
  }

  private write(target: McpTarget, expected: string | null, remove: boolean): McpSetupDone {
    if (this.files[target] !== expected) throw fsError('config_changed', 'changed');
    const after = this.plan(target, remove);
    let backup: string | null = null;
    if (after !== null) {
      if (expected !== null) {
        backup = `${FAKE_CLIENT_PATHS[target]}.app-iconic-${this.backups.length + 1}.bak`;
        this.backups.push([backup, expected]);
      }
      this.files[target] = after;
    }
    return { path: FAKE_CLIENT_PATHS[target], backup };
  }

  async install(target: McpTarget, expected: string | null): Promise<McpSetupDone> {
    return this.write(target, expected, false);
  }

  async uninstall(target: McpTarget, expected: string | null): Promise<McpSetupDone> {
    return this.write(target, expected, true);
  }

  async test(): Promise<McpProbe> {
    this.missingSidecar();
    this.tests++;
    return { ...this.probeValue };
  }

  /** The app sends a tool call; resolves with this window's answer. */
  send(tool: string, args: Record<string, unknown> = {}): Promise<FakeReply> {
    const callId = this.nextId++;
    const answer = new Promise<FakeReply>((resolve) => this.waiting.set(callId, resolve));
    this.callFn?.({ callId, tool, args });
    return answer;
  }

  setStatus(i: McpInfo): void {
    this.infoValue = i;
    this.statusFn?.(i);
  }
}
