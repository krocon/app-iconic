import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IconItem } from '../document/model/selection';
import { FieldDef } from './icon-fields';
import { IconInspectorService } from './icon-inspector.service';
import { FieldState } from './inspector-edit';
import { INSPECTOR_TEXTS } from './inspector-texts';

/**
 * The appearance tools of a field (design 010 E3): in Dark / Tinted a ✕ removes this
 * appearance's own value (the default applies again), a dot says "shared with all appearances –
 * a change creates a variant"; ⋯ marks kept platform variants (`idiom`).
 */
@Component({
  selector: 'app-variant-tools',
  template: `
    <span class="tools">
      @if (state().otherVariants) {
        <span class="mark" [title]="t.otherVariants" [attr.aria-label]="t.otherVariants">⋯</span>
      }
      @if (appearance() !== 'default') {
        @if (state().variant) {
          <button
            type="button"
            class="tool"
            data-testid="remove-variant"
            [title]="removeLabel()"
            [attr.aria-label]="removeLabel()"
            (click)="icon.removeVariant(target(), def().id)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        } @else {
          <span class="mark shared" [title]="t.sharedValue" [attr.aria-label]="t.sharedValue"
            >•</span
          >
        }
      }
    </span>
  `,
  styles: `
    :host {
      display: contents;
    }
    .tools {
      display: flex;
      gap: 2px;
      justify-content: flex-end;
      align-items: center;
      min-width: 0;
    }
    .mark {
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
      padding: 0 2px;
      cursor: default;
    }
    .tool {
      width: 20px;
      height: 20px;
      padding: 3px;
      color: var(--color-text-muted);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background: var(--color-hover);
        color: var(--color-text);
      }
      svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
        stroke-linecap: round;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VariantTools {
  readonly target = input.required<IconItem>();
  readonly def = input.required<FieldDef>();
  readonly state = input.required<FieldState>();
  protected readonly icon = inject(IconInspectorService);
  protected readonly t = INSPECTOR_TEXTS;
  protected readonly appearance = this.icon.appearance;
  protected readonly removeLabel = computed(() =>
    this.t.removeVariant(this.t.appearances[this.appearance()]),
  );
}
