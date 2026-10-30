import { computed, inject, Injectable, signal } from '@angular/core';
import { FsError, toFsError } from '../../core/errors/fs-error';
import { McpApi } from '../../core/mcp/mcp-api';
import { McpClientStatus, McpSetupDone, McpSetupPlan, McpTarget } from '../../core/mcp/mcp.models';
import { DiffLine, lineDiff } from './line-diff';

/** What the last “Apply” did. */
export type SetupResult =
  | { kind: 'installed' | 'removed'; target: McpTarget; done: McpSetupDone }
  | { kind: 'error'; error: FsError };

/**
 * Setting up Claude Desktop / Cursor in Settings › AI control (prompt 086 E4/E7): status per
 * target, preview as a line diff, “Apply” only with the text the user saw (`expected`). One per
 * `McpSetup` component (not root).
 */
@Injectable()
export class McpSetupStore {
  private readonly api = inject(McpApi);

  readonly clients = signal<readonly McpClientStatus[]>([]);
  readonly target = signal<McpTarget>('claudeDesktop');
  readonly status = computed(() => this.clients().find((c) => c.target === this.target()) ?? null);
  /** The preview waiting for “Apply”, and whether it removes. */
  readonly plan = signal<{ plan: McpSetupPlan; remove: boolean } | null>(null);
  readonly diff = computed<DiffLine[]>(() => {
    const p = this.plan()?.plan;
    return p && p.after !== null ? lineDiff(p.before, p.after) : [];
  });
  readonly busy = signal(false);
  readonly result = signal<SetupResult | null>(null);
  /** Requests in flight: an older answer is dropped. */
  private seq = 0;

  async load(): Promise<void> {
    const n = ++this.seq;
    try {
      const list = await this.api.clients();
      if (n === this.seq) this.clients.set(list);
    } catch (e) {
      if (n === this.seq) this.result.set({ kind: 'error', error: toFsError(e) });
    }
  }

  choose(t: McpTarget): void {
    if (t === this.target()) return;
    this.target.set(t);
    this.plan.set(null);
    this.result.set(null);
  }

  /** Shows what “Set up” (`remove: false`) or “Remove” would write. */
  async preview(remove: boolean): Promise<void> {
    const target = this.target();
    this.busy.set(true);
    this.result.set(null);
    try {
      const plan = await this.api.preview(target, remove);
      if (target === this.target()) this.plan.set({ plan, remove });
    } catch (e) {
      this.plan.set(null);
      this.result.set({ kind: 'error', error: toFsError(e) });
    } finally {
      this.busy.set(false);
    }
  }

  cancel(): void {
    this.plan.set(null);
  }

  /** Writes what the preview showed; a file changed in between gets a new preview. */
  async apply(): Promise<void> {
    const p = this.plan();
    if (!p || p.plan.after === null || this.busy()) return;
    const { target, before } = p.plan;
    this.busy.set(true);
    try {
      const done = p.remove
        ? await this.api.uninstall(target, before)
        : await this.api.install(target, before);
      this.plan.set(null);
      this.result.set({ kind: p.remove ? 'removed' : 'installed', target, done });
    } catch (e) {
      const error = toFsError(e);
      this.busy.set(false);
      if (error.code === 'config_changed') await this.preview(p.remove);
      else this.plan.set(null);
      this.result.set({ kind: 'error', error });
    } finally {
      this.busy.set(false);
    }
    await this.load();
  }
}
