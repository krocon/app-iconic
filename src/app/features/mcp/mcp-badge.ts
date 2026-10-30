import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { MCP_TEXTS } from './mcp-texts';
import { McpStore } from './mcp.store';

/**
 * The “AI” badge in the header (018 E16, prompt 086 E11): shows while an AI is connected or this
 * window has an AI history; opens the history popover (`mcp.history`), where “Disconnect AI” is.
 */
@Component({
  selector: 'app-mcp-badge',
  template: `
    @if (mcp.badge()) {
      <button
        type="button"
        class="btn quiet ai-badge"
        data-testid="ai-badge"
        [class.idle]="!mcp.connected()"
        [title]="label()"
        [attr.aria-label]="label()"
        aria-haspopup="dialog"
        [attr.aria-expanded]="mcp.historyOpen()"
        (click)="actions.run('mcp.history')"
      >
        {{ t.badge }}
      </button>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .ai-badge {
      margin-left: var(--space-2);
      font-weight: 600;
      color: var(--color-accent-text);
      background: var(--color-accent);
      border-color: var(--color-accent);

      /* not connected, only a history: quiet, still readable */
      &.idle {
        color: var(--color-accent);
        background: transparent;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McpBadge {
  protected readonly mcp = inject(McpStore);
  protected readonly actions = inject(ActionService);
  protected readonly t = MCP_TEXTS;
  protected readonly label = computed(() => {
    const history = this.actions.label('mcp.history');
    return this.mcp.connected()
      ? `${this.t.badgeTitle(this.mcp.info().connections)} – ${history}`
      : history;
  });
}
