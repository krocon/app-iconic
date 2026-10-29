import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PREVIEW_SIZES, SmallPreviewService } from './small-preview.service';
import { PREVIEW_TEXTS as T } from './preview-texts';

/**
 * The icon in 16, 32, 64 and 128 px (prompt 057) in the lower right corner of the canvas, drawn
 * like the export; View › Small Sizes.
 */
@Component({
  selector: 'app-small-preview',
  template: `
    @if (service.visible()) {
      <figure class="box" data-testid="small-preview" [attr.aria-label]="t.title">
        <div class="row">
          @for (s of sizes; track s) {
            <div class="cell">
              @if (service.url(); as url) {
                <img [src]="url" [width]="s" [height]="s" alt="" [attr.data-size]="s" />
              } @else {
                <span class="empty" [style.width.px]="s" [style.height.px]="s"></span>
              }
              <span class="label">{{ t.size(s) }}</span>
            </div>
          }
        </div>
      </figure>
    }
  `,
  styles: `
    :host {
      position: absolute;
      right: var(--space-2);
      bottom: var(--space-2);
      z-index: 2;
      pointer-events: none;
    }
    .box {
      margin: 0;
      padding: var(--space-2);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      box-shadow: 0 2px 10px rgb(0 0 0 / 15%);
    }
    .row {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
    }
    .cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .label {
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .empty {
      display: block;
      background: var(--color-surface-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SmallPreview {
  protected readonly service = inject(SmallPreviewService);
  protected readonly t = T;
  protected readonly sizes = PREVIEW_SIZES;
}
