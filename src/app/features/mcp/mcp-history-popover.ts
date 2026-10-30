import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { clock, McpHistoryEntry } from './mcp-history';
import { MCP_TEXTS } from './mcp-texts';
import { McpStore } from './mcp.store';

/**
 * The AI history (prompt 086 E9–E11): a popover at the header badge with the last calls of this
 * window – time, tool, what, result – and “Undo” for the call whose step is the last one.
 * Non-modal like the popovers of 073: the window stays usable.
 */
@Component({
  selector: 'app-mcp-history-popover',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.historyTitle" width="26rem" (closed)="dialogs.close()">
      <p class="hint">{{ t.historyHint }}</p>
      @if (mcp.history().length === 0) {
        <p class="empty" data-testid="ai-history-empty">{{ t.historyEmpty }}</p>
      } @else {
        <ul class="list" data-testid="ai-history" [attr.aria-label]="t.historyTitle">
          @for (e of mcp.history(); track e.seq) {
            <li class="entry" [class.failed]="!e.ok" data-testid="ai-history-entry">
              <span class="time">{{ time(e) }}</span>
              <span class="what">
                <code class="tool">{{ e.tool }}</code>
                @if (e.detail) {
                  <span class="detail" [title]="e.detail">{{ e.detail }}</span>
                }
              </span>
              <span class="result" [class.error]="!e.ok">
                {{ e.ok ? t.historyOk : e.code }}
              </span>
              @if (mcp.undoable(e)) {
                <button
                  type="button"
                  class="btn"
                  data-testid="ai-history-undo"
                  [attr.aria-label]="t.historyUndoLabel(e.tool)"
                  (click)="undo(e)"
                >
                  {{ t.historyUndo }}
                </button>
              }
            </li>
          }
        </ul>
      }
      <div class="footer">
        @if (mcp.connected()) {
          <button
            type="button"
            class="btn"
            data-testid="ai-history-disconnect"
            (click)="actions.run('mcp.disconnect')"
          >
            {{ actions.label('mcp.disconnect') }}
          </button>
        }
        <span class="spacer"></span>
        <button
          type="button"
          class="btn"
          data-testid="ai-history-clear"
          data-autofocus
          [disabled]="mcp.history().length === 0"
          (click)="actions.run('mcp.clearHistory')"
        >
          {{ t.historyClear }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .hint,
    .empty {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 50vh;
      overflow: auto;
      border-top: 1px solid var(--color-border);
    }

    .entry {
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-2) var(--space-1) 0;
      border-bottom: 1px solid var(--color-border);
      font-size: var(--font-size-small);
    }

    .time {
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
    }

    .what {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .tool {
      font-family: var(--font-mono);
    }

    .detail {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--color-text-muted);
    }

    .result.error {
      color: var(--color-error);
      font-family: var(--font-mono);
    }

    .footer {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }

    .spacer {
      flex: 1;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpHistoryPopover {
  protected readonly mcp = inject(McpStore);
  protected readonly actions = inject(ActionService);
  protected readonly dialogs = inject(DialogService);
  protected readonly t = MCP_TEXTS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected time(e: McpHistoryEntry): string {
    return clock(e.at);
  }

  protected undo(e: McpHistoryEntry): void {
    this.mcp.undoEntry(e);
    // the button goes away: keep the focus in the popover (Esc, Tab still work)
    setTimeout(() => {
      const el = this.host.nativeElement;
      if (el.contains(document.activeElement)) return;
      el.querySelector<HTMLElement>(
        '[data-testid="ai-history-undo"], [data-testid="ai-history-clear"]',
      )?.focus();
    });
  }
}
