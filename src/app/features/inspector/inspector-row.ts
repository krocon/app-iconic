import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NumberField } from '../../shared/controls/number-field';
import { SelectField } from '../../shared/controls/select-field';
import { ToggleField } from '../../shared/controls/toggle-field';
import { IconItem } from '../document/model/selection';
import { FieldDef } from './icon-fields';
import { IconInspectorService } from './icon-inspector.service';
import { FieldState } from './inspector-edit';
import { INSPECTOR_TEXTS } from './inspector-texts';
import { VariantTools } from './variant-tools';

const text = (v: unknown): string | null =>
  typeof v === 'number' || typeof v === 'string'
    ? String(v)
    : typeof v === 'boolean'
      ? String(v)
      : null;

/**
 * One field of the icon inspector (design 010 E1–E5): editor of the field kind (shared controls of
 * 009) + the appearance tools. Typed numbers and sliders are one gesture, choices and switches
 * one step. A value from the built-in default shows as placeholder.
 */
@Component({
  selector: 'app-inspector-row',
  imports: [NumberField, SelectField, ToggleField, VariantTools],
  template: `
    @let d = def();
    @let s = state();
    @switch (d.kind) {
      @case ('number') {
        <app-number-field
          [fieldId]="fieldId()"
          [label]="label()"
          [value]="own()"
          [placeholder]="fallback()"
          [min]="d.min"
          [max]="d.max"
          [step]="d.step ?? 1"
          (edited)="number($event)"
          (committed)="icon.commit()"
          (reverted)="icon.cancel()"
        />
      }
      @case ('toggle') {
        <app-toggle-field
          [fieldId]="fieldId()"
          [label]="label()"
          [value]="own()"
          [placeholder]="fallback()"
          (edited)="icon.set(target(), d.id, $event === 'true')"
        />
      }
      @case ('blur') {
        <app-toggle-field
          [fieldId]="fieldId()"
          [label]="label()"
          [value]="s.value === null ? 'false' : 'true'"
          (edited)="icon.set(target(), d.id, $event === 'true' ? 0.5 : null)"
        />
      }
      @default {
        <app-select-field
          [fieldId]="fieldId()"
          [label]="label()"
          [value]="own()"
          [placeholder]="fallback()"
          [options]="options()"
          [optionLabels]="t.optionLabels"
          [clearable]="false"
          (edited)="$event !== null && icon.set(target(), d.id, $event)"
        />
      }
    }
    <app-variant-tools [target]="target()" [def]="d" [state]="s" />
    @if (d.kind === 'blur' && s.value !== null) {
      <app-number-field
        [fieldId]="fieldId() + '-amount'"
        [label]="t.fields['translucency.value']"
        [value]="own()"
        [min]="0"
        [max]="1"
        [step]="0.01"
        (edited)="number($event)"
        (committed)="icon.commit()"
        (reverted)="icon.cancel()"
      />
      <span></span>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InspectorRow {
  readonly target = input.required<IconItem>();
  readonly def = input.required<FieldDef>();
  readonly state = input.required<FieldState>();
  readonly fieldId = input.required<string>();
  /** Choices of an `asset` field (the document's assets). */
  readonly assets = input<readonly string[]>([]);
  protected readonly icon = inject(IconInspectorService);
  protected readonly t = INSPECTOR_TEXTS;

  protected readonly label = computed(() => this.t.fields[this.def().id] ?? this.def().id);
  /** The value set in the file (for this appearance or the base); `null` = built-in default. */
  protected readonly own = computed(() =>
    this.state().source === 'default' ? null : text(this.state().value),
  );
  protected readonly fallback = computed(() =>
    this.state().source === 'default' ? (text(this.state().value) ?? '') : '',
  );
  protected readonly options = computed(() =>
    this.def().kind === 'asset' ? this.assets() : (this.def().options ?? []),
  );

  protected number(v: string | null): void {
    const n = v === null ? NaN : Number(v);
    if (Number.isFinite(n)) this.icon.edit(this.target(), this.def(), n);
  }
}
