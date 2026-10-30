import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FileDropService } from './file-drop.service';
import { FILES_TEXTS as T } from './files-texts';

/**
 * The hint while files are dragged over the window (design 071 E4): a frame around the window and,
 * at the pointer, a mark with what the drop will do (insert here, new layer, open). Not focusable,
 * announced politely once per kind.
 */
@Component({
  selector: 'app-drop-hint',
  template: `
    @if (hover(); as h) {
      <div class="frame" [class.none]="h.kind === 'none'" data-testid="drop-hint"></div>
      <div
        class="mark"
        [style.left.px]="h.x"
        [style.top.px]="h.y"
        [attr.data-kind]="h.kind"
        data-testid="drop-mark"
      >
        @if (h.kind === 'insert') {
          <span class="cross" aria-hidden="true"></span>
        }
        <span class="label">{{ label() }}</span>
      </div>
    }
    <span class="sr" aria-live="polite">{{ label() }}</span>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 40;
      pointer-events: none;
    }
    .frame {
      position: absolute;
      inset: 2px;
      border: 2px dashed var(--color-accent);
      border-radius: var(--radius);
      &.none {
        border-color: var(--color-text-muted);
      }
    }
    .mark {
      position: absolute;
      display: flex;
      gap: var(--space-2);
      align-items: center;
      transform: translate(-10px, -10px);
    }
    .cross {
      width: 20px;
      height: 20px;
      background:
        linear-gradient(var(--color-accent), var(--color-accent)) center / 2px 100% no-repeat,
        linear-gradient(var(--color-accent), var(--color-accent)) center / 100% 2px no-repeat;
    }
    .label {
      padding: var(--space-1) var(--space-2);
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-popup);
      font-size: var(--font-size-small);
      white-space: nowrap;
      transform: translate(14px, 14px);
    }
    .sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropHint {
  protected readonly hover = inject(FileDropService).hover;
  protected readonly label = computed(() => {
    const k = this.hover()?.kind;
    return k ? T.dropHint[k] : '';
  });
}
