import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { FieldKey } from '../../shared/geometry/sketch/sketch-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { SketchService } from './sketch.service';
import { SketchStore } from './sketch.store';
import { SKETCH_TEXTS } from './sketch-texts';
import { constructionPath, crossesPath, shapePath, targetPath } from './sketch-preview';

const ANGLES: ReadonlySet<FieldKey> = new Set<FieldKey>(['angle', 'start', 'sweep']);
/** Distance of the fields from the pointer and their rough size (to keep them on the canvas). */
const FIELD_GAP_PX = 18;
const FIELD_WIDTH_PX = 170;
const FIELD_HEIGHT_PX = 36;

/** A field value as shown: at most two decimals, no trailing zeros. */
export function formatValue(v: number | undefined): string {
  return v === undefined || !Number.isFinite(v) ? '' : String(Math.round(v * 100) / 100);
}

/** A typed number: comma or point as the decimal separator; `null` = not a number. */
export function parseValue(text: string): number | null {
  const t = text.trim().replace(',', '.').replace(/°$/, '').trim();
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/**
 * Preview and dimension fields of the sketch tools (design 019 E6, E7): its own `<svg>` in
 * VIEWPORT pixels (never in the document DOM) with the shape, construction lines, placed points
 * and picked / hovered targets, and Fusion-like fields beside the pointer. A typed value is fixed
 * (marked) until the field is emptied; Tab cycles the fields, Enter places the step, Esc drops the
 * shape. These keys are the local editing of input fields, not app functions (design 008 E10).
 */
@Component({
  selector: 'app-sketch-overlay',
  template: `
    <svg class="overlay" aria-hidden="true" data-testid="sketch-preview">
      @for (d of picked(); track $index) {
        <path class="picked" [attr.d]="d" />
      }
      @if (hover(); as d) {
        <path class="hover" [attr.d]="d" />
      }
      @if (construction(); as d) {
        <path class="construction" [attr.d]="d" />
      }
      @if (outline(); as d) {
        <path class="shape" data-testid="sketch-shape" [attr.d]="d" />
      }
      @if (crosses(); as d) {
        <path class="points" [attr.d]="d" />
      }
    </svg>
    @if (fields().length && anchor(); as at) {
      <div
        class="fields"
        role="group"
        data-testid="sketch-fields"
        [attr.aria-label]="t.fieldsLabel"
        [title]="t.fieldsHint"
        [style.left.px]="at.left"
        [style.right.px]="at.right"
        [style.top.px]="at.top"
        [style.bottom.px]="at.bottom"
      >
        @for (f of fields(); track f) {
          <label class="field" [class.locked]="locked(f)">
            <span class="name">{{ t.fields[f] }}</span>
            <input
              #field
              class="input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              spellcheck="false"
              [attr.data-field]="f"
              [attr.aria-label]="locked(f) ? t.fixed(t.fields[f]) : t.fields[f]"
              [value]="shown(f)"
              (input)="typed(f, $event)"
              (keydown)="key(f, $event)"
              (pointerdown)="$event.stopPropagation()"
            />
            @if (angle(f)) {
              <span class="unit" aria-hidden="true">°</span>
            }
          </label>
        }
      </div>
    }
  `,
  styles: `
    :host,
    .overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }
    .shape {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;
    }
    .construction {
      fill: none;
      stroke: var(--ai-handle-control);
      stroke-width: 1;
      stroke-dasharray: 4 3;
    }
    .points {
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;
    }
    .picked,
    .hover {
      fill: none;
      stroke: var(--ai-snap-magic);
      stroke-width: 3;
      opacity: 0.7;
    }
    .hover {
      stroke-width: 4;
      opacity: 0.5;
    }
    .fields {
      position: absolute;
      display: flex;
      gap: 6px;
      pointer-events: auto;
    }
    .field {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: var(--radius);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-popup);
      font-size: var(--font-size-small);
      color: var(--color-text);

      &.locked {
        border-color: var(--color-accent);
      }
      &.locked .input {
        font-weight: 600;
      }
    }
    .name {
      color: var(--color-text-muted);
    }
    .input {
      width: 5.5em;
      font: inherit;
      color: inherit;
      background: transparent;
      border: none;
      text-align: right;
      padding: 1px 2px;

      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: 1px;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SketchOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly t = SKETCH_TEXTS;
  protected readonly store = inject(SketchStore);
  private readonly service = inject(SketchService);
  private readonly inputs = viewChildren<ElementRef<HTMLInputElement>>('field');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly canvas = inject(CanvasViewStore);
  /** Text being typed per field (shown instead of the live value). */
  private readonly drafts = signal<Partial<Record<FieldKey, string>>>({});
  private focusedSerial = -1;

  protected readonly fields = this.store.fields;
  protected readonly outline = computed(() => shapePath(this.store.preview(), this.toView()));
  protected readonly construction = computed(
    () =>
      constructionPath(
        this.store.preview(),
        this.store.placed().map((p) => p.p),
        this.toView(),
      ) || null,
  );
  protected readonly crosses = computed(
    () =>
      crossesPath(
        this.store
          .placed()
          .filter((p) => !p.tangent)
          .map((p) => p.p),
        this.toView(),
      ) || null,
  );
  protected readonly hover = computed(() => targetPath(this.store.hover(), this.toView()));
  protected readonly picked = computed(() =>
    this.store.picked().flatMap((x) => targetPath(x, this.toView()) ?? []),
  );
  /**
   * Where the fields sit: below right of the pointer's step (viewport pixels), on the other side
   * near the right or bottom edge of the canvas.
   */
  protected readonly anchor = computed(() => {
    const cur = this.store.current() ?? this.store.placed().at(-1) ?? null;
    if (!cur) return null;
    const p = apply(this.toView(), cur.p);
    const { width, height } = this.canvas.viewport();
    const wide = this.fields().length * FIELD_WIDTH_PX;
    const left = p.x + FIELD_GAP_PX + wide > width && p.x - FIELD_GAP_PX - wide >= 0;
    const up = p.y + FIELD_GAP_PX + FIELD_HEIGHT_PX > height;
    return {
      left: left ? null : p.x + FIELD_GAP_PX,
      right: left ? width - p.x + FIELD_GAP_PX : null,
      top: up ? null : p.y + FIELD_GAP_PX,
      bottom: up ? height - p.y + FIELD_GAP_PX : null,
    };
  });

  constructor() {
    // a new step: drafts go, the first field gets the focus (type at once, like Fusion)
    afterRenderEffect(() => {
      const serial = this.store.stepSerial();
      const inputs = this.inputs();
      if (serial === this.focusedSerial || !inputs.length) return;
      this.focusedSerial = serial;
      this.drafts.set({});
      const first = inputs[0].nativeElement;
      first.focus({ preventScroll: true });
      first.select();
    });
  }

  protected angle(f: FieldKey): boolean {
    return ANGLES.has(f);
  }

  protected locked(f: FieldKey): boolean {
    return this.store.locks()[f] !== undefined;
  }

  protected shown(f: FieldKey): string {
    return this.drafts()[f] ?? formatValue(this.store.values()[f]);
  }

  protected typed(f: FieldKey, e: Event): void {
    const text = (e.target as HTMLInputElement).value;
    this.drafts.update((d) => ({ ...d, [f]: text }));
    if (text.trim() === '') this.store.setLock(f, null);
    else {
      const v = parseValue(text);
      if (v !== null) this.store.setLock(f, v);
    }
  }

  protected key(f: FieldKey, e: KeyboardEvent): void {
    const typing = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (typing && this.drafts()[f] === undefined) {
      // the first key replaces the live value (it changes with the pointer, like Fusion)
      (e.target as HTMLInputElement).value = '';
    } else if (e.key === 'Tab') {
      const inputs = this.inputs().map((r) => r.nativeElement);
      if (inputs.length < 2) return;
      e.preventDefault();
      const i = inputs.findIndex((x) => x.dataset['field'] === f);
      const next = inputs[(i + (e.shiftKey ? inputs.length - 1 : 1)) % inputs.length];
      next.focus();
      next.select();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = this.store.place();
      if (result) void this.service.insert(result.shape);
      this.backToCanvas();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.store.escape();
      this.backToCanvas();
    }
  }

  /** Without fields in the next step the keyboard goes back to the canvas (Esc, Space, arrows). */
  private backToCanvas(): void {
    if (this.store.fields().length) return;
    this.host.nativeElement.closest<HTMLElement>('.viewport')?.focus({ preventScroll: true });
  }
}
