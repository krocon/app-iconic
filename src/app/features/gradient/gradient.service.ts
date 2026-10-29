import { inject, Injectable, signal } from '@angular/core';
import {
  AttributeChange,
  CompositeCommand,
  DocCommand,
  InsertDefinition,
  InsertNode,
  RemoveNode,
  ReplaceNode,
  SetAttributes,
} from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { NodeRef } from '../document/icon-document';
import { stripInternal } from '../document/svg/node-ids';
import { collectIds } from '../document/svg/svg-references';
import { UndoLabel } from '../document/undo/undo-texts';
import { FilesService } from '../files/files.service';
import {
  colorAt,
  GradientInfo,
  GradientKind,
  isGradient,
  Paint,
  paintGradient,
  readGradient,
  usersOf,
} from './gradient-model';

/** What the gradient tools work on: a gradient, and the element painting with it (if any). */
export interface GradientTarget {
  info: GradientInfo;
  ref: NodeRef;
  owner: { ref: NodeRef; el: Element; paint: Paint } | null;
  /** Elements of the asset that use it (more than one: shared). */
  users: number;
}

export interface StopChange {
  offset?: number;
  color?: string;
  opacity?: number;
}

const n = (v: number) => String(Math.round(v * 10000) / 10000);
const SVG = 'http://www.w3.org/2000/svg';

/** The `style` text without the properties `names`; `null` if nothing is left. */
function withoutStyle(style: string | null, names: readonly string[]): string | null {
  if (!style) return null;
  const rest = style
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && !names.includes(d.split(':')[0].trim()));
  return rest.length ? rest.join('; ') : null;
}

/**
 * The gradient editor (prompt 032): reads the gradient of the selection, writes every change as a
 * document command – live changes (dragging a stop, a colour, a handle) as one undo gesture.
 * Creating puts a new gradient into `<defs>` (unique id) and points fill / stroke at it.
 */
@Injectable({ providedIn: 'root' })
export class GradientService {
  private readonly files = inject(FilesService);
  private live = false;
  /** Fill or stroke: which paint the panel and the handles work on. */
  readonly paint = signal<Paint>('fill');
  /** The handles on the canvas (start / end, centre / radius / focus) are shown. */
  readonly onCanvas = signal(false);

  store(): DocumentStore | null {
    return this.files.store();
  }

  /** The gradient of the (single) selected element: the element itself, its fill, its stroke. */
  target(paint?: Paint): GradientTarget | null {
    const s = this.store();
    const sel = s?.selection() ?? [];
    if (!s || sel.length !== 1) return null;
    const doc = s.document();
    const el = doc.node(sel[0]);
    if (!el) return null;
    let g: Element | null = null;
    let owner: GradientTarget['owner'] = null;
    if (isGradient(el)) g = el;
    else {
      for (const p of paint ? [paint] : (['fill', 'stroke'] as const)) {
        g = paintGradient(el, p);
        if (g) {
          owner = { ref: sel[0], el, paint: p };
          break;
        }
      }
    }
    const info = g ? readGradient(g) : null;
    const ref = g ? doc.refOf(g) : null;
    if (!info || !ref) return null;
    const root = doc.asset(ref.asset)?.svg?.root;
    return { info, ref, owner, users: root && info.id ? usersOf(root, info.id) : 0 };
  }

  private run(cmd: DocCommand | null): boolean {
    const s = this.store();
    if (!s || !cmd) return false;
    if (this.live) {
      s.update(cmd);
      return true;
    }
    s.execute(cmd);
    return true;
  }

  /** Starts a live change (one undo step until {@link end}). */
  begin(): void {
    const s = this.store();
    if (!s || this.live) return;
    s.begin('editGradient');
    this.live = true;
  }

  end(keep = true): void {
    const s = this.store();
    if (!s || !this.live) return;
    this.live = false;
    if (keep) s.commit();
    else s.cancel();
  }

  /** Attributes of the gradient element itself (kind-independent: units, spread, transform, coords). */
  setAttributes(t: GradientTarget, attrs: Readonly<Record<string, string | null>>): boolean {
    const changes: AttributeChange[] = Object.entries(attrs).map(([name, value]) => ({
      ref: t.ref,
      name,
      value,
    }));
    return changes.length ? this.run(new SetAttributes(changes, 'editGradient')) : false;
  }

  private stopRef(t: GradientTarget, i: number): NodeRef | null {
    const el = t.info.stops[i]?.el;
    return el ? (this.store()?.document().refOf(el) ?? null) : null;
  }

  setStop(t: GradientTarget, i: number, c: StopChange): boolean {
    const ref = this.stopRef(t, i);
    const el = t.info.stops[i]?.el;
    if (!ref || !el) return false;
    const changes: AttributeChange[] = [];
    if (c.offset !== undefined) {
      changes.push({ ref, name: 'offset', value: n(Math.max(0, Math.min(1, c.offset))) });
    }
    if (c.color !== undefined) changes.push({ ref, name: 'stop-color', value: c.color });
    if (c.opacity !== undefined) {
      changes.push({
        ref,
        name: 'stop-opacity',
        value: c.opacity >= 1 ? null : n(Math.max(0, c.opacity)),
      });
    }
    // a colour / opacity in `style` would win over the attribute
    const names = [
      c.color !== undefined && 'stop-color',
      c.opacity !== undefined && 'stop-opacity',
    ].filter((x): x is string => !!x);
    const style = el.getAttribute('style');
    if (names.length && style !== null) {
      const next = withoutStyle(style, names);
      if (next !== style) changes.push({ ref, name: 'style', value: next });
    }
    return changes.length ? this.run(new SetAttributes(changes, 'editGradient')) : false;
  }

  /** A new stop at `offset` with the colour the gradient has there. */
  addStop(t: GradientTarget, offset: number, color?: string): boolean {
    const s = this.store();
    const owner = t.info.stops[0]?.el.parentElement ?? t.info.el;
    const ownerRef = s?.document().refOf(owner);
    if (!s || !ownerRef) return false;
    const at = colorAt(t.info.stops, offset);
    const index = t.info.stops.filter((x) => x.offset <= offset).length;
    const stopsBefore = [...owner.children].filter((c) => c.localName === 'stop');
    const domIndex =
      index < stopsBefore.length
        ? [...owner.children].indexOf(stopsBefore[index])
        : owner.children.length;
    const op = at.opacity < 1 ? ` stop-opacity="${n(at.opacity)}"` : '';
    const markup = `<stop xmlns="${SVG}" offset="${n(offset)}" stop-color="${color ?? at.color}"${op}/>`;
    return this.run(new InsertNode(ownerRef, markup, domIndex, 'editGradient'));
  }

  removeStop(t: GradientTarget, i: number): boolean {
    const ref = this.stopRef(t, i);
    if (!ref || t.info.stops.length <= 2) return false;
    return this.run(new RemoveNode(ref));
  }

  /** Linear ↔ radial: the element is replaced, id, stops and the other attributes stay. */
  setKind(t: GradientTarget, kind: GradientKind): boolean {
    if (t.info.kind === kind) return false;
    const old = t.info.el;
    const el = old.ownerDocument.createElementNS(
      SVG,
      kind === 'linear' ? 'linearGradient' : 'radialGradient',
    );
    const coords = new Set(['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy', 'fr']);
    for (const a of [...old.attributes]) if (!coords.has(a.name)) el.setAttribute(a.name, a.value);
    for (const c of [...old.childNodes]) el.append(c.cloneNode(true));
    stripInternal(el);
    return this.run(
      new CompositeCommand('editGradient', [
        new ReplaceNode(t.ref, new XMLSerializer().serializeToString(el)),
      ]),
    );
  }

  /** A new gradient for `paint` of the selected element (from its colour to white). */
  create(kind: GradientKind = 'linear', paint: Paint = 'fill'): boolean {
    const s = this.store();
    const sel = s?.selection() ?? [];
    if (!s || sel.length !== 1) return false;
    const doc = s.document();
    const el = doc.node(sel[0]);
    const root = doc.asset(sel[0].asset)?.svg?.root;
    if (!el || !root) return false;
    const ids = collectIds(root);
    let k = 1;
    while (ids.has(`gradient-${k}`)) k++;
    const id = `gradient-${k}`;
    const cur = getComputedStyle(el)[paint];
    const from = /^#|^rgb/.test(cur ?? '') ? toHex(cur) : '#0a84ff';
    const tag = kind === 'linear' ? 'linearGradient' : 'radialGradient';
    const markup =
      `<${tag} xmlns="${SVG}" id="${id}"><stop offset="0" stop-color="${from}"/>` +
      `<stop offset="1" stop-color="#ffffff"/></${tag}>`;
    const cmd = new CompositeCommand('createGradient' as UndoLabel, [
      new InsertDefinition(sel[0].asset, markup, 'createGradient'),
      new SetAttributes([{ ref: sel[0], name: paint, value: `url(#${id})` }], 'createGradient'),
    ]);
    return this.run(cmd);
  }

  /** A copy only for the selected element (the others keep the shared one). */
  makeUnique(t: GradientTarget): boolean {
    const s = this.store();
    if (!s || !t.owner) return false;
    const root = s.document().asset(t.ref.asset)?.svg?.root;
    if (!root) return false;
    const ids = collectIds(root);
    let k = 2;
    while (ids.has(`${t.info.id}-${k}`)) k++;
    const id = `${t.info.id}-${k}`;
    const copy = t.info.el.cloneNode(true) as Element;
    stripInternal(copy);
    copy.setAttribute('id', id);
    return this.run(
      new CompositeCommand('editGradient', [
        new InsertDefinition(
          t.ref.asset,
          new XMLSerializer().serializeToString(copy),
          'editGradient',
        ),
        new SetAttributes(
          [{ ref: t.owner.ref, name: t.owner.paint, value: `url(#${id})` }],
          'editGradient',
        ),
      ]),
    );
  }
}

/** `rgb(r, g, b)` → `#rrggbb`. */
function toHex(c: string): string {
  if (c.startsWith('#')) return c;
  const m = c.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return '#0a84ff';
  return (
    '#' +
    m
      .slice(0, 3)
      .map((v) => Math.round(Number(v)).toString(16).padStart(2, '0'))
      .join('')
  );
}
