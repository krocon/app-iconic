import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ColorPicker } from './color-picker';
import { browserColor, toHex, toRgba } from './color-value';
import { CONTROLS_TEXTS } from './controls-texts';

/**
 * A colour chip that opens the colour popover (prompt 074 E1) – used by the colour field of the
 * panel and the context bar. Live edits while the popover is open (`edited`), `committed` when it
 * ends, `reverted` on Esc; the focus goes back to the chip.
 */
@Component({
  selector: 'app-color-button',
  imports: [ColorPicker],
  template: `
    <button
      #chip
      type="button"
      class="chip-btn"
      data-color-opener
      [attr.data-testid]="testId()"
      [attr.aria-label]="t.pickColor + ': ' + label()"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      [disabled]="disabled()"
      [style.--chip]="css()"
      [class.none]="css() === null"
      (click)="toggle()"
    ></button>
    @if (open()) {
      <app-color-picker
        [value]="value()"
        [fallback]="fallback()"
        [label]="label()"
        [anchor]="anchor()"
        (changed)="edited.emit($event)"
        (done)="close(true)"
        (cancelled)="close(false)"
      />
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    .chip-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: 4px;
      background:
        linear-gradient(var(--chip), var(--chip)),
        repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 8px 8px;
      cursor: pointer;
      &.none {
        background: linear-gradient(
          to top right,
          transparent 45%,
          var(--color-error) 45% 55%,
          transparent 55%
        );
      }
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: 1px;
      }
      &:disabled {
        opacity: 0.4;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorButton {
  readonly value = input<string | null>(null);
  readonly fallback = input('');
  readonly label = input('');
  readonly testId = input<string | null>(null);
  readonly disabled = input(false);
  readonly edited = output<string>();
  readonly committed = output<void>();
  readonly reverted = output<void>();
  protected readonly t = CONTROLS_TEXTS;
  protected readonly open = signal(false);
  protected readonly anchor = signal<DOMRect | null>(null);
  private readonly chip = viewChild.required<ElementRef<HTMLButtonElement>>('chip');

  /** The chip's colour (with alpha); `null` = none / unknown. */
  protected readonly css = computed(() => {
    const c = toRgba(this.value() || this.fallback(), browserColor);
    return c ? toHex(c) : null;
  });

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.anchor.set(this.chip().nativeElement.getBoundingClientRect());
    this.open.set(true);
  }

  close(commit: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (commit) this.committed.emit();
    else this.reverted.emit();
    setTimeout(() => this.chip().nativeElement.focus());
  }
}
