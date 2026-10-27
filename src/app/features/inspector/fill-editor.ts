import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NumberField } from '../../shared/controls/number-field';
import { SelectField } from '../../shared/controls/select-field';
import { IconItem } from '../document/model/selection';
import {
  DEFAULT_ORIENTATION,
  FillModel,
  NEW_FILL_KINDS,
  readFill,
  switchKind,
  withColor,
  withOrientation,
  writeFill,
} from './fill-model';
import { IconColorField } from './icon-color-field';
import { FieldDef } from './icon-fields';
import { IconInspectorService } from './icon-inspector.service';
import { FieldState } from './inspector-edit';
import { INSPECTOR_TEXTS } from './inspector-texts';
import { VariantTools } from './variant-tools';

/**
 * The fill editor (design 010 E6): kind, colours (one or two) and the orientation of gradients –
 * a view of the `fill` value that writes Apple's format back. A fill we do not know is shown as
 * JSON and kept.
 */
@Component({
  selector: 'app-fill-editor',
  imports: [IconColorField, NumberField, SelectField, VariantTools],
  template: `
    @let m = model();
    <app-select-field
      [fieldId]="fieldId() + '-kind'"
      [label]="t.kind"
      [value]="state().source === 'default' ? null : m.kind"
      [placeholder]="t.fillKinds[m.kind]"
      [options]="kinds()"
      [optionLabels]="t.fillKinds"
      [clearable]="false"
      (edited)="kind($event)"
    />
    <app-variant-tools [target]="target()" [def]="def()" [state]="state()" />
    @if (m.kind === 'unknown') {
      <p class="note wide" role="note">{{ t.unknownFill }}</p>
      <pre class="raw wide">{{ raw() }}</pre>
    }
    @for (c of m.colors; track $index) {
      <app-icon-color-field
        [fieldId]="fieldId() + '-color-' + $index"
        [label]="t.color($index, m.colors.length)"
        [value]="c"
        (edited)="color($index, $event)"
        (committed)="icon.commit()"
        (reverted)="icon.cancel()"
      />
      <span></span>
    }
    @if (gradient()) {
      @for (p of points; track p.id) {
        <app-number-field
          [fieldId]="fieldId() + '-' + p.id"
          [label]="p.label"
          [value]="coordinate(p.end, p.axis)"
          [placeholder]="defaults[p.end][p.axis] + ''"
          [step]="0.01"
          (edited)="orient(p.end, p.axis, $event)"
          (committed)="icon.commit()"
          (reverted)="icon.cancel()"
        />
        <span></span>
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .note {
      margin: 0;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .raw {
      margin: 0;
      max-height: 8rem;
      overflow: auto;
      font-family: var(--font-mono);
      font-size: var(--font-size-small);
      white-space: pre-wrap;
      word-break: break-all;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FillEditor {
  readonly target = input.required<IconItem>();
  readonly def = input.required<FieldDef>();
  readonly state = input.required<FieldState>();
  readonly fieldId = input.required<string>();
  protected readonly icon = inject(IconInspectorService);
  protected readonly t = INSPECTOR_TEXTS;

  protected readonly model = computed<FillModel>(() => readFill(this.state().value));
  protected readonly kinds = computed(() => {
    const k = this.model().kind;
    return NEW_FILL_KINDS.includes(k) ? NEW_FILL_KINDS : [...NEW_FILL_KINDS, k];
  });
  protected readonly gradient = computed(() =>
    ['linear-gradient', 'radial-gradient'].includes(this.model().kind),
  );
  protected readonly raw = computed(() => JSON.stringify(this.state().value, null, 2));
  protected readonly defaults = DEFAULT_ORIENTATION;
  protected readonly points = [
    { id: 'start-x', end: 'start', axis: 'x', label: `${INSPECTOR_TEXTS.start} x` },
    { id: 'start-y', end: 'start', axis: 'y', label: `${INSPECTOR_TEXTS.start} y` },
    { id: 'stop-x', end: 'stop', axis: 'x', label: `${INSPECTOR_TEXTS.stop} x` },
    { id: 'stop-y', end: 'stop', axis: 'y', label: `${INSPECTOR_TEXTS.stop} y` },
  ] as const;

  protected kind(k: string | null): void {
    if (k === null || k === this.model().kind) return;
    this.icon.set(this.target(), this.def().id, writeFill(switchKind(this.model(), k as never)));
  }

  protected color(i: number, c: string | null): void {
    if (c !== null)
      this.icon.edit(this.target(), this.def(), writeFill(withColor(this.model(), i, c)));
  }

  protected coordinate(end: 'start' | 'stop', axis: 'x' | 'y'): string | null {
    const o = this.model().orientation;
    return o ? String(o[end][axis]) : null;
  }

  protected orient(end: 'start' | 'stop', axis: 'x' | 'y', v: string | null): void {
    const n = v === null ? NaN : Number(v);
    if (!Number.isFinite(n)) return;
    this.icon.edit(
      this.target(),
      this.def(),
      writeFill(withOrientation(this.model(), end, axis, n)),
    );
  }
}
