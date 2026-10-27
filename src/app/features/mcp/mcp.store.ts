import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { McpApi } from '../../core/mcp/mcp-api';
import { McpCall, McpError, McpInfo, NO_MCP } from '../../core/mcp/mcp.models';
import { isMcpError, mcpError } from './mcp-read';
import { McpTools } from './mcp-tools';

/**
 * AI control in the window (design 018 E4/E5/E16): listens for the tool calls the app hands to
 * this window, runs them one after the other (`McpTools`) and answers; keeps the state of the
 * bridge for the settings dialog and the header badge; `mcp.disconnect`. After editlicious
 * `features/mcp/mcp.store.ts` (design 016) – there the documents live in Rust, here in the window.
 */
@Injectable({ providedIn: 'root' })
export class McpStore {
  private readonly api = inject(McpApi);
  private readonly tools = inject(McpTools);
  private readonly actions = inject(ActionService);

  readonly info = signal<McpInfo>(NO_MCP);
  readonly connected = computed(() => this.info().enabled && this.info().connections > 0);
  /** One call at a time – the undo group of a call must not take in another's steps. */
  private queue: Promise<unknown> = Promise.resolve();
  private started = false;

  /** Starts listening (once, from the app root); `ready()` follows when the document is there. */
  start(destroyRef: DestroyRef): void {
    if (this.started) return;
    this.started = true;
    const offs: (() => void)[] = [];
    destroyRef.onDestroy(() => offs.forEach((f) => f()));
    void this.api
      .onCall((c) => this.onCall(c))
      .then((off) => offs.push(off))
      .catch(() => undefined);
    void this.api
      .onStatus((i) => this.info.set(i))
      .then((off) => offs.push(off))
      .catch(() => undefined);
    void this.refresh();
    this.actions.registerAll(
      {
        'mcp.disconnect': {
          run: () => this.disconnect(),
          enabled: () => this.connected(),
        },
      },
      destroyRef,
    );
  }

  /** The window has its document: the app may send calls now (design 018 E5). */
  ready(): Promise<void> {
    return this.api.ready().catch(() => undefined);
  }

  async refresh(): Promise<void> {
    const i = await this.api.info().catch(() => null);
    if (i) this.info.set(i);
  }

  async disconnect(): Promise<void> {
    await this.api.disconnect().catch(() => undefined);
    await this.refresh();
  }

  /** The line for Claude Code (design 018 E16); `''` without a sidecar. */
  command(): string {
    const p = this.info().sidecar;
    return p ? `claude mcp add app-iconic -- "${p}"` : '';
  }

  /** Runs one tool as the bridge would (also the test hook of the browser mode). */
  execute(tool: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const run = this.queue.then(() => this.tools.run(tool, args));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async onCall(c: McpCall): Promise<void> {
    let result: unknown = null;
    let error: McpError | null = null;
    try {
      result = (await this.execute(c.tool, c.args ?? {})) ?? null;
    } catch (e) {
      error = isMcpError(e)
        ? { code: e.code, message: e.message }
        : mcpError('io', e instanceof Error ? e.message : String(e));
    }
    await this.api.reply(c.callId, result, error).catch(() => undefined);
  }
}
