import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ColorButton } from '../../shared/controls/color-button';
import { FilesService } from '../files/files.service';
import { ColorLibrary } from './color-library';
import { COLOR_TEXTS as T } from './color-texts';

/**
 * "Document Colours" in the properties panel (prompt 074 E4): every colour of the icon as a swatch
 * (most used first, with its count as tooltip). Choose one, then the new colour in the popover –
 * on "Done" `color.replace` swaps it in the whole icon (one undo step). Collapsed by default.
 */
@Component({
  selector: 'app-colors-section',
  imports: [ColorButton],
  template: `
    @if (hasDocument()) {
      <details
        class="section"
        data-testid="colors-section"
        [open]="open()"
        (toggle)="onToggle($event)"
      >
        <summary class="section-title">{{ t.section }} ({{ colors().length }})</summary>
        @if (open()) {
          <p class="hint">{{ t.sectionHint }}</p>
          <div class="swatches" role="radiogroup" [attr.aria-label]="t.section">
            @for (c of colors(); track c.color) {
              <button
                type="button"
                role="radio"
                class="sw"
                [attr.aria-checked]="from() === c.color"
                [attr.data-color]="c.color"
                [attr.aria-label]="c.color + ', ' + t.uses(c.count)"
                [title]="c.color + ' – ' + t.uses(c.count)"
                [style.background]="c.color"
                (click)="from.set(c.color)"
              ></button>
            }
          </div>
          @if (from(); as f) {
            <div class="replace">
              <span>{{ t.replaceWith }}</span>
              <app-color-button
                testId="colors-replace-with"
                [value]="to() ?? f"
                [label]="t.replaceWith"
                (edited)="to.set($event)"
                (committed)="replace(f)"
                (reverted)="to.set(null)"
              />
            </div>
          }
        }
      </details>
    }
  `,
  styles: `
    .section {
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--color-border);
    }
    .section-title {
      font-size: var(--font-size-small);
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--color-text-muted);
      cursor: pointer;
    }
    .hint {
      margin: var(--space-1) 0;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .sw {
      width: 20px;
      height: 20px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      &[aria-checked='true'] {
        outline: 2px solid var(--color-accent);
        outline-offset: 1px;
      }
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: 1px;
      }
    }
    .replace {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      margin-top: var(--space-2);
      font-size: var(--font-size-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorsSection {
  protected readonly t = T;
  private readonly library = inject(ColorLibrary);
  private readonly files = inject(FilesService);
  private readonly actions = inject(ActionService);
  protected readonly hasDocument = computed(() => !!this.files.store());
  protected readonly colors = computed(() => this.library.documentColors());
  protected readonly open = signal(false);
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);

  protected onToggle(e: Event): void {
    this.open.set((e.target as HTMLDetailsElement).open);
  }

  protected replace(from: string): void {
    const to = this.to();
    this.to.set(null);
    if (!to) return;
    void this.actions.run('color.replace', { from, to });
    this.from.set(null);
  }
}
