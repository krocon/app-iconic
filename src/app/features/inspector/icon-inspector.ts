import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { SelectField } from '../../shared/controls/select-field';
import { TextField } from '../../shared/controls/text-field';
import { ToggleField } from '../../shared/controls/toggle-field';
import { DocumentStore } from '../document/document.store';
import { IconItem } from '../document/model/selection';
import { APPEARANCE_KEYS, AppearanceKey } from '../document/model/specializations';
import { FillEditor } from './fill-editor';
import { COLOR_SPACES, FieldDef, FieldSection, FIELDS, KNOWN_KEYS } from './icon-fields';
import { IconInspectorService } from './icon-inspector.service';
import { fieldState, FieldState, targetObject } from './inspector-edit';
import { InspectorRow } from './inspector-row';
import { InspectorSection } from './inspector-section';
import { INSPECTOR_TEXTS } from './inspector-texts';
import { JsonPreview } from './json-preview';
import { hasWatch, readSquares, SQUARES_CHOICES, SquaresChoice } from './platforms';

type SectionId = FieldSection | 'platforms' | 'groupIdentity' | 'other' | 'json';

interface Row {
  def: FieldDef;
  state: FieldState;
}

/** Notes per section: what the canvas shows only approximately or not at all (design 010 E13). */
const NOTES: Partial<Record<SectionId, 'approximation' | 'notRendered'>> = {
  shadow: 'approximation',
  translucency: 'approximation',
  liquidGlass: 'notRendered',
};

/**
 * The icon inspector (design 010): root, group or layer of `icon.json` in Apple's format – with
 * the appearance switch (Default / Dark / Tinted), the editable fields of the evidence files,
 * "Other properties (read-only)" and the live icon.json preview. Lives in the properties panel.
 */
@Component({
  selector: 'app-icon-inspector',
  imports: [
    FillEditor,
    InspectorRow,
    InspectorSection,
    JsonPreview,
    SelectField,
    TextField,
    ToggleField,
  ],
  templateUrl: './icon-inspector.html',
  styleUrl: './icon-inspector.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconInspector {
  readonly store = input.required<DocumentStore>();
  readonly target = input.required<IconItem>();
  protected readonly icon = inject(IconInspectorService);
  protected readonly t = INSPECTOR_TEXTS;
  protected readonly appearances = APPEARANCE_KEYS;
  protected readonly squaresChoices = SQUARES_CHOICES;
  protected readonly colorSpaces = COLOR_SPACES;
  protected readonly notes = NOTES;
  private nameDraft: string | null = null;
  private fileDraft: string | null = null;

  private readonly json = computed(() => this.store().document().iconJson);
  protected readonly obj = computed(() => targetObject(this.json(), this.target()) ?? {});
  protected readonly appearance = this.icon.appearance;

  /** Field rows by section, in the order of the field catalogue. */
  protected readonly sections = computed(() => {
    const t = this.target();
    const json = this.json();
    const a = this.appearance();
    const out: { id: SectionId; rows: Row[] }[] = [];
    for (const def of FIELDS[t.kind]) {
      const row = { def, state: fieldState(json, t, def, a) };
      const last = out.at(-1);
      if (last?.id === def.section) last.rows.push(row);
      else out.push({ id: def.section, rows: [row] });
    }
    return out;
  });

  protected readonly assets = computed(() => [...this.store().document().assets.keys()]);
  /** The asset the layer shows in this appearance. */
  protected readonly assetName = computed(() => {
    const s = this.sections()
      .flatMap((x) => x.rows)
      .find((r) => r.def.id === 'image-name');
    return typeof s?.state.value === 'string' ? s.state.value : null;
  });
  protected readonly name = computed(() => {
    const n = this.obj()['name'];
    return typeof n === 'string' ? n : null;
  });
  protected readonly platforms = computed(() => {
    const sp = this.json()['supported-platforms'];
    const o = (typeof sp === 'object' && sp !== null ? sp : {}) as Record<string, unknown>;
    const squares = readSquares(o['squares']);
    return {
      squares,
      choices: squares === 'other' ? [...SQUARES_CHOICES, 'other'] : SQUARES_CHOICES,
      watch: hasWatch(o['circles']) ? 'true' : 'false',
    };
  });
  protected readonly colorSpace = computed(() => {
    const v = this.json()['color-space-for-untagged-svg-colors'];
    return typeof v === 'string' ? v : null;
  });
  /** Keys the inspector does not edit (design 010 E1). */
  protected readonly other = computed(() => {
    const known = KNOWN_KEYS[this.target().kind];
    return Object.entries(this.obj())
      .filter(([k]) => !known.has(k))
      .map(([key, v]) => ({ key, text: JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ') }));
  });
  protected readonly fieldPrefix = computed(() => {
    const t = this.target();
    return t.kind === 'root'
      ? 'icon'
      : t.kind === 'group'
        ? `g${t.group}`
        : `l${t.group}-${t.layer}`;
  });

  protected setAppearance(a: AppearanceKey): void {
    this.icon.setAppearance(a);
  }

  protected draftName(v: string | null): void {
    this.nameDraft = v;
  }

  protected commitName(): void {
    const v = this.nameDraft;
    this.nameDraft = null;
    const t = this.target();
    if (v === null) return;
    if (t.kind === 'group') this.icon.renameGroup(t.group, v);
    if (t.kind === 'layer') this.icon.renameLayer(t.group, t.layer, v);
  }

  protected draftFile(v: string | null): void {
    this.fileDraft = v;
  }

  protected commitFile(): void {
    const v = this.fileDraft;
    this.fileDraft = null;
    const from = this.assetName();
    if (v !== null && from) this.icon.renameAsset(from, v);
  }

  protected squares(v: string | null): void {
    if (v && v !== 'other')
      this.icon.setPlatforms({ squares: v as Exclude<SquaresChoice, 'other'> });
  }
}
