import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ClipboardApi } from '../../core/clipboard/clipboard-api';
import { describeFsError } from '../../core/errors/fs-error';
import { MCP_TARGETS, McpProbe, McpTarget } from '../../core/mcp/mcp.models';
import { SETTINGS_TEXTS } from '../settings/settings-texts';
import { McpSetupStore, SetupResult } from './mcp-setup.store';
import { MCP_TEXTS } from './mcp-texts';
import { McpStore } from './mcp.store';

/**
 * Settings › AI control, below the switches (prompt 086 E13): set up Claude Desktop or Cursor
 * with a preview of the change, the Claude Code line (018 E16) and the connection test.
 */
@Component({
  selector: 'app-mcp-setup',
  templateUrl: './mcp-setup.html',
  styleUrl: './mcp-setup.css',
  providers: [McpSetupStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpSetup {
  protected readonly setup = inject(McpSetupStore);
  protected readonly mcp = inject(McpStore);
  protected readonly actions = inject(ActionService);
  private readonly clipboard = inject(ClipboardApi);
  protected readonly t = MCP_TEXTS;
  protected readonly s = SETTINGS_TEXTS;
  protected readonly targets = MCP_TARGETS;
  protected readonly copied = signal(false);
  protected readonly sidecar = computed(() => this.mcp.info().sidecar);

  constructor() {
    void this.setup.load();
  }

  protected async copyCommand(line: string): Promise<void> {
    await this.clipboard.writeText(line).catch(() => undefined);
    this.copied.set(true);
  }

  protected choose(t: McpTarget): void {
    this.setup.choose(t);
  }

  /** The sentence for the result of “Apply”. */
  protected resultText(r: SetupResult): string {
    if (r.kind === 'error') return describeFsError(r.error);
    const app = this.t.targets[r.target];
    return r.kind === 'installed' ? this.t.installed(app) : this.t.removed(app);
  }

  /** The sentence for the connection test (design 086 E8). */
  protected probeText(p: McpProbe): string {
    if (p.ok) {
      return this.t.probeOk(p.server ?? 'app-iconic', p.version ?? '', p.tools, p.documents ?? 0);
    }
    if (p.code === 'not_running') return this.t.probeOff;
    if (p.step === 'start') return this.t.probeStart;
    if (p.code === 'timeout') return this.t.probeTimeout;
    if (p.code === 'invalid_request') return this.t.probeBad;
    return this.t.probeFailed(p.code ?? 'io');
  }

  protected errorText = describeFsError;

  /** The sign before a diff line – not only its colour (a11y). */
  protected sign(kind: 'same' | 'add' | 'del'): string {
    return kind === 'add' ? '+' : kind === 'del' ? '−' : ' ';
  }
}
