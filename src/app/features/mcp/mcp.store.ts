import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { McpApi } from '../../core/mcp/mcp-api';
import { FsError, toFsError } from '../../core/errors/fs-error';
import { McpCall, McpError, McpInfo, McpProbe, NO_MCP } from '../../core/mcp/mcp.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { FilesService } from '../files/files.service';
import { canUndo, describeCall, McpHistoryEntry, pushEntry } from './mcp-history';
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
  private readonly files = inject(FilesService);
  private readonly dialogs = inject(DialogService);

  readonly info = signal<McpInfo>(NO_MCP);
  readonly connected = computed(() => this.info().enabled && this.info().connections > 0);
  /** The last AI calls of this window, newest first – only in memory (prompt 086 E9). */
  readonly history = signal<readonly McpHistoryEntry[]>([]);
  /** The badge shows while connected or while there is a history (E11). */
  readonly badge = computed(() => this.connected() || this.history().length > 0);
  readonly historyOpen = computed(() => this.dialogs.open() === 'aiHistory');
  /** The connection test (E8): running, its result or its error. */
  readonly testing = signal(false);
  readonly probe = signal<McpProbe | null>(null);
  readonly probeError = signal<FsError | null>(null);
  /** Which document each entry's undo step belongs to (not part of the pure entry). */
  private readonly owners = new Map<number, unknown>();
  private seq = 0;
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
        'mcp.history': {
          run: () => this.toggleHistory(),
          checked: () => this.historyOpen(),
        },
        'mcp.clearHistory': {
          run: () => this.clearHistory(),
          enabled: () => this.history().length > 0,
        },
        'mcp.test': {
          run: () => this.test(),
          enabled: () => !this.testing() && this.info().sidecar !== null,
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
    const run = this.queue.then(() => this.recorded(tool, args));
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Runs one tool and writes it into the history (E9): result, time, its undo step. */
  private async recorded(tool: string, args: Record<string, unknown>): Promise<unknown> {
    const at = Date.now();
    const before = this.files.store();
    const top = before?.undoTopId() ?? 0;
    let ok = true;
    let code: string | null = null;
    try {
      return await this.tools.run(tool, args);
    } catch (e) {
      ok = false;
      code = isMcpError(e) ? e.code : 'io';
      throw e;
    } finally {
      const after = this.files.store();
      const id = after?.undoTopId() ?? 0;
      // a new step on the same document = this call's undo group (018 E10); step ids only grow,
      // so an undo (smaller id on top) is no step of its own
      const undoId = after && after === before && id > top ? id : null;
      const seq = ++this.seq;
      if (undoId !== null) this.owners.set(seq, after);
      this.history.update((list) => {
        const next = pushEntry(list, {
          seq,
          at,
          tool,
          detail: describeCall(tool, args),
          ok,
          code,
          ms: Date.now() - at,
          undoId,
        });
        const kept = new Set(next.map((e) => e.seq));
        for (const k of this.owners.keys()) if (!kept.has(k)) this.owners.delete(k);
        return next;
      });
    }
  }

  /** “Undo” of `e` is offered: its step is the last one of the document shown now (E10). */
  undoable(e: McpHistoryEntry): boolean {
    const s = this.files.store();
    return !!s && this.owners.get(e.seq) === s && canUndo(e, s.undoTopId());
  }

  /** Takes back the step of `e` – only while it is the last one. */
  undoEntry(e: McpHistoryEntry): boolean {
    if (!this.undoable(e)) return false;
    return this.actions.run('edit.undo');
  }

  clearHistory(): void {
    this.history.set([]);
    this.owners.clear();
  }

  toggleHistory(): void {
    if (this.historyOpen()) this.dialogs.close();
    else if (this.dialogs.open() === null) this.dialogs.show('aiHistory');
  }

  /** The connection test (E8); the result stays in `probe` / `probeError`. */
  async test(): Promise<McpProbe | null> {
    if (this.testing()) return null;
    this.testing.set(true);
    this.probe.set(null);
    this.probeError.set(null);
    try {
      const p = await this.api.test();
      this.probe.set(p);
      return p;
    } catch (e) {
      this.probeError.set(toFsError(e));
      return null;
    } finally {
      this.testing.set(false);
    }
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
