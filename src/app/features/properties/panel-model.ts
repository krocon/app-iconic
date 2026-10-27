import { IconDocument, NodeRef } from '../document/icon-document';
import { combine, Combined } from './mixed';
import { bySection, commonSpec, PropertyDef, SectionId } from './property-spec';
import { isSet } from './property-edit';
import { ownValue, readProperty, readText, ValueSource } from './property-values';

/**
 * What the properties panel shows for a selection (design 009 E5, E9): the common properties by
 * section, each with its combined value (same / mixed), where a single value comes from, and
 * whether it can be reset or edited. Reads the DOM.
 */

export interface PanelRow {
  def: PropertyDef;
  /** The element's own value(s); `same` with `null` = nobody sets it. */
  value: Combined;
  /** Shown greyed when no node sets the property (inherited / computed / default). */
  fallback: string | null;
  source: ValueSource;
  /** Some selected node sets it (Reset shows). */
  set: boolean;
  editable: boolean;
}

export interface PanelSection {
  section: SectionId;
  rows: PanelRow[];
}

export interface PanelModel {
  /** `rect` – or the count of a multiple selection. */
  kind: string;
  count: number;
  sections: PanelSection[];
  /** The selected elements (first = the one whose values the transform editor shows). */
  elements: Element[];
}

export function panelModel(doc: IconDocument, refs: readonly NodeRef[]): PanelModel | null {
  const els = refs.map((r) => doc.node(r)).filter((e): e is Element => e !== null);
  if (els.length === 0) return null;
  const defs = commonSpec(els.map((e) => e.localName));
  const sections = bySection(defs).map(({ section, defs }) => ({
    section,
    rows: defs.map((def) => row(def, els)),
  }));
  return {
    kind: els.length === 1 ? els[0].localName : 'multiple',
    count: els.length,
    sections,
    elements: els,
  };
}

function row(def: PropertyDef, els: readonly Element[]): PanelRow {
  const own = els.map((e) => ownValue(e, def.name)?.value ?? null);
  const value = combine(own);
  const first = readProperty(els[0], def);
  const unset = value.kind === 'same' && value.value === null;
  return {
    def,
    value,
    fallback: unset ? first.value : null,
    source: unset ? first.source : (ownValue(els[0], def.name)?.source ?? 'none'),
    set: def.reset && els.some((e) => isSet(e, def.name)),
    editable: def.name !== 'text' || els.every((e) => readText(e).editable),
  };
}
