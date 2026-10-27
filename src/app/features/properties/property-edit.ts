import { fmt } from '../../shared/geometry/align';
import { AttributeChange, DocCommand, SetAttributes, SetText } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { IconDocument, NodeRef } from '../document/icon-document';
import { styleValue, styleWithout } from '../document/svg/style-props';
import { UndoLabel } from '../document/undo/undo-texts';
import { follow, partnerOf } from './constrain';
import { commonSpec, isCssProperty } from './property-spec';
import { attrNameOf, ownValue, parseLength, readText } from './property-values';

/**
 * Writing properties (design 009 E3, E4, E6, E8): a value becomes an attribute; a `style`
 * property of the same name goes in the same step (else the change would not show). Everything
 * is ONE serialisable `setAttributes` (text content: `setText`). The targets of an edit are fixed
 * when it starts (`planEdit`), so every keystroke of a field gives a command with the same
 * targets and the gesture merges them into one.
 */

/** Undo names of legacy §12. */
const LABELS: Record<string, UndoLabel> = {
  fill: 'changeFill',
  stroke: 'changeStroke',
  'stroke-width': 'changeStrokeWidth',
  opacity: 'changeOpacity',
  'font-size': 'changeFontSize',
  'font-family': 'changeFontFamily',
  'font-weight': 'changeFontWeight',
  text: 'changeText',
  transform: 'changeTransform',
};

export function labelFor(name: string): UndoLabel {
  return Object.hasOwn(LABELS, name) ? LABELS[name] : 'changeAttribute';
}

interface PlannedNode {
  ref: NodeRef;
  /** The attribute to write (`href` or `xlink:href`). */
  attr: string;
  /** The new `style` (without the property) – `undefined` when the style does not have it. */
  style?: string | null;
  /** Constrain proportions: own and partner value before the edit (design 009 E6). */
  own: number | null;
  partner: { attr: string; n: number; unit: string } | null;
}

/** The fixed targets of one edit of property `name`. */
export interface EditPlan {
  name: string;
  nodes: PlannedNode[];
}

function lengthOf(el: Element, name: string): { n: number; unit: string } | null {
  return parseLength(ownValue(el, name)?.value ?? null);
}

/** The nodes of `refs` that have `name` in their spec, with what an edit has to change. */
export function planEdit(doc: IconDocument, refs: readonly NodeRef[], name: string): EditPlan {
  const nodes: PlannedNode[] = [];
  for (const ref of refs) {
    const el = doc.node(ref);
    if (!el || !commonSpec([el.localName]).some((d) => d.name === name)) continue;
    const css = isCssProperty(name) && styleValue(el, name) !== null;
    const p = partnerOf(name);
    const pl = p ? lengthOf(el, p) : null;
    nodes.push({
      ref,
      attr: attrNameOf(el, name),
      ...(css ? { style: styleWithout(el, name) } : {}),
      own: lengthOf(el, name)?.n ?? null,
      partner: p && pl ? { attr: p, ...pl } : null,
    });
  }
  return { name, nodes };
}

/**
 * The changes of setting the planned property to `value` (`null` = remove). `constrain` lets the
 * partner (`height` of `width` …) follow in the ratio before the edit.
 */
export function editChanges(
  plan: EditPlan,
  value: string | null,
  constrain = false,
): AttributeChange[] {
  const v = value === null ? null : parseLength(value);
  return plan.nodes.flatMap((n) => {
    const out: AttributeChange[] = [{ ref: n.ref, name: n.attr, value }];
    if (n.style !== undefined) out.push({ ref: n.ref, name: 'style', value: n.style });
    if (constrain && v && n.partner) {
      const f = follow(v.n, n.own, n.partner.n);
      if (f !== null)
        out.push({ ref: n.ref, name: n.partner.attr, value: fmt(f) + n.partner.unit });
    }
    return out;
  });
}

/** The command of one edit; `null` when no selected node has the property. */
export function editCommand(
  plan: EditPlan,
  value: string | null,
  constrain = false,
  label: UndoLabel = labelFor(plan.name),
): DocCommand | null {
  if (plan.nodes.length === 0) return null;
  if (plan.name === 'text') {
    return value === null
      ? null
      : new SetText(plan.nodes.map((n) => ({ ref: n.ref, text: value })));
  }
  return new SetAttributes(editChanges(plan, value, constrain), label);
}

/** `name = value` on every selected node that has it – one step (`properties.set`). */
export function setPropertyCommand(
  doc: IconDocument,
  refs: readonly NodeRef[],
  name: string,
  value: string,
  constrain = false,
): DocCommand | null {
  return editCommand(planEdit(doc, refs, name), value, constrain);
}

/**
 * Removes the properties `names` (attribute and `style` property) from the selected nodes – one
 * step "Reset Property" / "Reset All Properties" (design 009 E8). Only what is set; `null` when
 * nothing is.
 */
export function resetCommand(
  doc: IconDocument,
  refs: readonly NodeRef[],
  names: readonly string[] | 'all',
  label: UndoLabel = 'resetProperty',
): DocCommand | null {
  const changes: AttributeChange[] = [];
  for (const ref of refs) {
    const el = doc.node(ref);
    if (!el) continue;
    const spec = commonSpec([el.localName]).filter(
      (d) => d.reset && d.name !== 'text' && (names === 'all' || names.includes(d.name)),
    );
    const inStyle: string[] = [];
    for (const d of spec) {
      const attr = attrNameOf(el, d.name);
      if (el.hasAttribute(attr) || (attr.startsWith('xlink:') && ownValue(el, d.name))) {
        changes.push({ ref, name: attr, value: null });
      }
      if (isCssProperty(d.name) && styleValue(el, d.name) !== null) inStyle.push(d.name);
    }
    if (inStyle.length) changes.push({ ref, name: 'style', value: styleWithout(el, ...inStyle) });
  }
  return changes.length ? new SetAttributes(changes, label) : null;
}

/** Whether the element sets `name` itself (the reset button shows then). */
export function isSet(el: Element, name: string): boolean {
  if (name === 'text') return readText(el).text !== '';
  return ownValue(el, name) !== null;
}

/**
 * One edit of a field as a gesture (design 009 E4): the first change starts it, every further one
 * updates it (one merged command), `commit` on Enter / blur, `cancel` on Escape restores.
 */
export class PropertySession {
  private started = false;
  private readonly plan: EditPlan;

  constructor(
    private readonly store: DocumentStore,
    refs: readonly NodeRef[],
    readonly name: string,
  ) {
    this.plan = planEdit(store.document(), refs, name);
  }

  get active(): boolean {
    return this.started;
  }

  /** Shows `value` live; `false` if it was refused (nothing changed). */
  edit(value: string | null, constrain = false): boolean {
    const label = labelFor(this.name);
    let cmd: DocCommand | null;
    try {
      cmd = editCommand(this.plan, value, constrain, label);
    } catch {
      return false;
    }
    if (!cmd) return false;
    if (!this.started) {
      this.store.begin(label);
      this.started = true;
    }
    try {
      this.store.update(cmd);
      return true;
    } catch {
      return false;
    }
  }

  commit(): void {
    if (this.started) this.store.commit();
    this.started = false;
  }

  cancel(): void {
    if (this.started) this.store.cancel();
    this.started = false;
  }
}
