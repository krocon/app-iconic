import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ColorField } from '../../shared/controls/color-field';
import { NumberField } from '../../shared/controls/number-field';
import { SegmentedField } from '../../shared/controls/segmented-field';
import { SelectField } from '../../shared/controls/select-field';
import { TextField } from '../../shared/controls/text-field';
import { ToggleField } from '../../shared/controls/toggle-field';
import { PanelRow } from './panel-model';
import { PropertiesService } from './properties.service';
import { PROPERTIES_TEXTS, propertyLabel } from './properties-texts';

/** Plain names of SVG keywords (the keyword itself stays the tooltip). */
const OPTION_NAMES: Readonly<Record<string, string>> = {
  butt: 'Butt',
  round: 'Round',
  square: 'Square',
  miter: 'Miter',
  bevel: 'Bevel',
  nonzero: 'Non-zero',
  evenodd: 'Even-odd',
  start: 'Start',
  middle: 'Middle',
  end: 'End',
};

/**
 * One property of the panel (design 009 E9): label + editor of the spec type + Reset (only when a
 * selected node sets it) – and the lock of Constrain proportions next to `width` / `rx`. The
 * editor's live edits become one gesture through the `PropertiesService`.
 */
@Component({
  selector: 'app-property-row',
  imports: [ColorField, NumberField, SegmentedField, SelectField, TextField, ToggleField],
  template: `
    @let r = row();
    @let d = r.def;
    @let label = shortLabel() ?? tr(d.label);
    @switch (d.type) {
      @case ('color') {
        <app-color-field
          [fieldId]="fieldId()"
          [label]="label"
          [value]="value()"
          [placeholder]="placeholder()"
          [mixed]="mixed()"
          [swatch]="swatch()"
          (edited)="edit($event)"
          (committed)="props.commit()"
          (reverted)="props.cancel()"
        />
      }
      @case ('enum') {
        @if (d.icons) {
          <app-segmented-field
            [fieldId]="fieldId()"
            [label]="label"
            [value]="value()"
            [placeholder]="r.fallback ?? d.default ?? ''"
            [mixed]="mixed()"
            [options]="d.options ?? []"
            [optionLabels]="optionLabels()"
            [icons]="d.icons"
            (edited)="edit($event)"
            (committed)="props.commit()"
            (reverted)="props.cancel()"
          />
        } @else {
          <app-select-field
            [fieldId]="fieldId()"
            [label]="label"
            [value]="value()"
            [placeholder]="r.fallback ?? ''"
            [mixed]="mixed()"
            [options]="d.options ?? []"
            (edited)="edit($event)"
            (committed)="props.commit()"
            (reverted)="props.cancel()"
          />
        }
      }
      @case ('toggle') {
        <app-toggle-field
          [fieldId]="fieldId()"
          [label]="label"
          [value]="value()"
          [placeholder]="r.fallback ?? ''"
          [mixed]="mixed()"
          [on]="d.on ?? 'true'"
          [off]="d.off ?? 'false'"
          (edited)="edit($event)"
          (committed)="props.commit()"
          (reverted)="props.cancel()"
        />
      }
      @case ('text') {
        <app-text-field
          [fieldId]="fieldId()"
          [label]="label"
          [value]="value()"
          [placeholder]="r.editable ? placeholder() : t.hasChildren"
          [readonly]="!r.editable"
          (edited)="edit($event)"
          (committed)="props.commit()"
          (reverted)="props.cancel()"
        />
      }
      @case ('textarea') {
        <app-text-field
          [fieldId]="fieldId()"
          [label]="label"
          [value]="value()"
          [placeholder]="placeholder()"
          [multiline]="true"
          [readonly]="!r.editable"
          (edited)="edit($event)"
          (committed)="props.commit()"
          (reverted)="props.cancel()"
        />
      }
      @default {
        <app-number-field
          [fieldId]="fieldId()"
          [label]="label"
          [value]="value()"
          [placeholder]="placeholder()"
          [min]="d.min"
          [max]="d.max"
          [step]="d.step ?? 1"
          [unit]="d.unit"
          [units]="d.type === 'length'"
          [compact]="compact()"
          (edited)="edit($event)"
          (committed)="props.commit()"
          (reverted)="props.cancel()"
        />
      }
    }
    <!-- the text area (path data) takes the whole row: no empty tools cell after it -->
    @if (d.type !== 'textarea' || r.set || lock()) {
      <span class="tools">
        @if (lock(); as l) {
          <button
            type="button"
            class="tool lock"
            [class.on]="l()"
            [attr.aria-pressed]="l()"
            [title]="t.constrain"
            [attr.aria-label]="t.constrain"
            (click)="l.set(!l())"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              @if (l()) {
                <path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v6H4z" />
              } @else {
                <path d="M5 7V5a3 3 0 0 1 6 0M4 7h8v6H4z" />
              }
            </svg>
          </button>
        }
        @if (r.set) {
          <button
            type="button"
            class="tool reset"
            [title]="t.reset(label)"
            [attr.aria-label]="t.reset(label)"
            (click)="props.reset(d.name)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 2.5v2.8h2.8" />
            </svg>
          </button>
        }
      </span>
    }
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
    }
    .tool {
      width: 20px;
      height: 20px;
      padding: 2px;
      color: var(--color-text-muted);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background: var(--color-hover);
        color: var(--color-text);
      }
      &.on {
        color: var(--color-accent);
      }
      svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.4;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PropertyRow {
  readonly row = input.required<PanelRow>();
  /** Prefix of the element ids (unique in the window). */
  readonly fieldId = input.required<string>();
  /** CSS background of a referenced gradient (fill / stroke). */
  readonly swatch = input<string | null>(null);
  /** Half a row of a pair (prompt 073 E1): numbers without their slider. */
  readonly compact = input(false);
  /** The label in a pair (`W` for Width …). */
  readonly shortLabel = input<string | null>(null);
  protected readonly props = inject(PropertiesService);
  protected readonly t = PROPERTIES_TEXTS;
  protected readonly tr = propertyLabel;

  protected readonly mixed = computed(() => this.row().value.kind === 'mixed');
  /** Names of the icon toggles' options in the UI language (prompt 073 E2). */
  protected readonly optionLabels = computed(() =>
    Object.fromEntries(
      (this.row().def.options ?? []).map((o) => [o, this.tr(OPTION_NAMES[o] ?? o)]),
    ),
  );
  protected readonly value = computed(() => {
    const v = this.row().value;
    return v.kind === 'same' ? v.value : null;
  });
  protected readonly placeholder = computed(() =>
    this.mixed() ? this.t.mixed : (this.row().fallback ?? ''),
  );
  protected readonly lock = computed(() => {
    const n = this.row().def.name;
    if (n === 'width') return this.props.constrainSize;
    if (n === 'rx') return this.props.constrainRadius;
    return null;
  });

  protected edit(v: string | null): void {
    const d = this.row().def;
    if (v === '') {
      if (!d.reset) return;
      this.props.edit(d.name, null);
      return;
    }
    this.props.edit(d.name, v);
  }
}
