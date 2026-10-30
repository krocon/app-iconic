import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { Point } from '../../shared/geometry/view-transform';
import { PropertiesService } from './properties.service';
import { PROPERTIES_TEXTS } from './properties-texts';
import { TransformStepRow } from './transform-step-row';
import {
  addStep,
  hasPivot,
  moveStep,
  normalizedArgs,
  parseTransformList,
  removeStep,
  serializeSteps,
  setPivot,
  setStepArgs,
  StepKind,
  STEP_KINDS,
  TransformStep,
} from './transform-list';
import { stepsMatrix } from './transform-matrix';

/**
 * The transform list of the panel (design 009 E7, legacy `TransformSection`): the steps of the
 * `transform` attribute in order ("top applies first"), "Add…", remove, reorder by dragging the
 * grip or Alt+↑/↓ / the arrow buttons, "Use pivot" for rotate, and the raw attribute (applied
 * only when valid). Typed numbers are one gesture; everything is `properties.set transform`.
 */
@Component({
  selector: 'app-transform-editor',
  imports: [TransformStepRow],
  template: `
    @let list = steps();
    @if (mixed()) {
      <p class="note">{{ t.transformMixed }}</p>
    } @else if (list && list.length === 0) {
      <p class="note">{{ t.transformEmpty }}</p>
    }
    @if (list && list.length) {
      <p class="note">{{ t.transformOrder }}</p>
      <ol class="steps" data-testid="transform-steps" (pointermove)="dragMove($event)">
        @for (s of list; track $index; let i = $index) {
          @if (dropAt() === i) {
            <li class="drop" aria-hidden="true"></li>
          }
          <app-transform-step-row
            [step]="s"
            [index]="i"
            [count]="list.length"
            [fieldId]="fieldId() + '-s' + i"
            [lockScale]="lockScale()"
            (arg)="editArg(i, $event.index, $event.value)"
            (commitArg)="commitArg()"
            (cancelArg)="cancelArg()"
            (pivot)="pivot(i, $event)"
            (lockScaleChange)="lockScale.set($event)"
            (move)="move(i, $event)"
            (remove)="apply(removeStep(list, i))"
            (dragStart)="dragStart(i, $event)"
            (dragEnd)="dragEnd($event)"
          />
        }
        @if (dropAt() === list.length) {
          <li class="drop" aria-hidden="true"></li>
        }
      </ol>
    }
    <div class="bar">
      <select
        class="input add"
        data-testid="transform-add"
        [attr.aria-label]="t.transformAdd"
        [disabled]="list === null"
        (change)="add($event)"
      >
        <option value="" selected>{{ t.transformAdd }}</option>
        @for (k of kinds; track k) {
          <option [value]="k">{{ t.steps[k] }}</option>
        }
      </select>
    </div>
    <label class="raw-label" [for]="fieldId() + '-raw'">{{ t.transformRaw }}</label>
    <input
      class="input raw"
      type="text"
      spellcheck="false"
      autocomplete="off"
      data-testid="transform-raw"
      [id]="fieldId() + '-raw'"
      [value]="rawShown()"
      [placeholder]="mixed() ? t.mixed : ''"
      [attr.aria-invalid]="!!rawError()"
      [attr.aria-describedby]="rawError() ? fieldId() + '-raw-error' : null"
      (input)="rawInput($event)"
      (keydown)="rawKey($event)"
      (blur)="rawApply()"
    />
    @if (rawError()) {
      <p class="error" role="alert" [id]="fieldId() + '-raw-error'">{{ rawError() }}</p>
    }
  `,
  styleUrl: './transform-editor.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransformEditor {
  /** The selected elements. */
  readonly elements = input.required<readonly Element[]>();
  /** Bumped on every document change (the elements stay the same objects). */
  readonly revision = input(0);
  readonly fieldId = input('tf');
  protected readonly props = inject(PropertiesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = PROPERTIES_TEXTS;
  protected readonly kinds = STEP_KINDS;
  protected readonly removeStep = removeStep;
  protected readonly lockScale = signal(false);
  protected readonly dropAt = signal<number | null>(null);
  private readonly rawDraft = signal<string | null>(null);
  protected readonly rawError = signal<string | null>(null);

  /** The common attribute text; `undefined` = mixed. */
  private readonly text = computed<string | undefined>(() => {
    this.revision();
    const texts = this.elements().map((e) => e.getAttribute('transform') ?? '');
    return texts.every((x) => x === texts[0]) ? texts[0] : undefined;
  });
  protected readonly mixed = computed(() => this.text() === undefined);
  /** The steps; `null` = invalid or mixed. */
  protected readonly steps = computed(() => {
    const t = this.text();
    return t === undefined ? null : parseTransformList(t);
  });
  protected readonly rawShown = computed(() => this.rawDraft() ?? this.text() ?? '');

  /** The steps a running number edit started from (other steps keep their text). */
  private base: TransformStep[] | null = null;
  private drag: { from: number; id: number } | null = null;

  /** Writes a new list (one step); an empty list removes the attribute. */
  protected apply(steps: readonly TransformStep[]): void {
    const text = serializeSteps(steps);
    if (text === '') this.props.reset('transform');
    else this.props.set('transform', text);
  }

  protected add(e: Event): void {
    const sel = e.target as HTMLSelectElement;
    const kind = sel.value as StepKind;
    sel.value = '';
    if (!kind) return;
    this.apply(addStep(this.steps() ?? [], kind));
  }

  protected move(i: number, dir: -1 | 1): void {
    const list = this.steps();
    if (!list || i + dir < 0 || i + dir >= list.length) return;
    this.apply(moveStep(list, i, i + dir));
    // the keyboard follows the moved step (Alt+↑/↓ on the grip)
    const at = i + dir;
    setTimeout(() =>
      this.host.nativeElement.querySelector<HTMLElement>(`[data-step="${at}"] .grip`)?.focus(),
    );
  }

  /** A typed / stepped number `j` of step `i` – live, as one gesture until commit. */
  protected editArg(i: number, j: number, value: string): void {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.base ??= this.steps();
    const base = this.base;
    const step = base?.[i];
    if (!base || !step) return;
    const args = normalizedArgs(step);
    if (step.kind === 'scale' && this.lockScale() && j < 2 && args[j] !== 0) {
      const other = 1 - j;
      args[other] = (args[other] * n) / args[j];
    }
    args[j] = n;
    const written = step.kind === 'rotate' && !hasPivot(step) ? [args[0]] : args;
    this.props.edit('transform', serializeSteps(setStepArgs(base, i, written)));
  }

  protected commitArg(): void {
    this.props.commit();
    this.base = null;
  }

  protected cancelArg(): void {
    this.props.cancel();
    this.base = null;
  }

  /** "Use pivot": on = the centre of the element's bbox (design 009 E7), off = `rotate(a)`. */
  protected pivot(i: number, on: boolean): void {
    const list = this.steps();
    if (!list) return;
    this.apply(
      setPivot(list, i, on ? bboxCenter(this.elements()[0]) : null, (s) => stepsMatrix(s)),
    );
  }

  // raw attribute
  protected rawInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.rawDraft.set(v);
    this.rawError.set(parseTransformList(v) === null ? this.t.transformInvalid : null);
  }

  protected rawKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.rawApply();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.rawDraft.set(null);
      this.rawError.set(null);
    }
  }

  protected rawApply(): void {
    const v = this.rawDraft();
    if (v === null || parseTransformList(v) === null) return;
    this.rawDraft.set(null);
    this.rawError.set(null);
    const text = v.trim();
    if (text === (this.text() ?? null)) return;
    if (text === '') this.props.reset('transform');
    else this.props.set('transform', text);
  }

  // drag to reorder (pointer events like the tree, design 006 E7)
  protected dragStart(i: number, e: PointerEvent): void {
    this.drag = { from: i, id: e.pointerId };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    this.dropAt.set(i);
  }

  protected dragMove(e: PointerEvent): void {
    if (!this.drag || this.drag.id !== e.pointerId) return;
    const rows = Array.from(
      (e.currentTarget as Element).querySelectorAll('app-transform-step-row'),
    );
    let at = rows.length;
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        at = k;
        break;
      }
    }
    this.dropAt.set(at);
  }

  protected dragEnd(e: PointerEvent): void {
    const d = this.drag;
    const at = this.dropAt();
    this.drag = null;
    this.dropAt.set(null);
    const list = this.steps();
    if (!d || d.id !== e.pointerId || at === null || !list) return;
    const to = at > d.from ? at - 1 : at;
    if (to !== d.from) this.apply(moveStep(list, d.from, to));
  }
}

/** Centre of the element's own bbox (its user space); the origin without layout. */
function bboxCenter(el: Element | undefined): Point {
  try {
    const b = (el as SVGGraphicsElement | undefined)?.getBBox?.();
    if (b) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  } catch {
    // not rendered
  }
  return { x: 0, y: 0 };
}
