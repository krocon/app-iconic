import { inject, Injectable } from '@angular/core';
import {
  Constraint,
  ConstraintType,
  isDimension,
  measure,
  resolve,
  systemResiduals,
} from '../../shared/geometry/constraints/constraints';
import {
  attributesOf,
  Circle,
  entityOf,
  Line,
  SketchSystem,
  systemOf,
} from '../../shared/geometry/constraints/sketch-model';
import { solve } from '../../shared/geometry/constraints/solver';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { fromDom, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import {
  AttributeChange,
  CompositeCommand,
  DocCommand,
  InsertDefinition,
  RemoveNode,
  SetAttributes,
  SetText,
} from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { UndoLabel } from '../document/undo/undo-texts';
import { FilesService } from '../files/files.service';
import {
  CID_ATTR,
  CONSTRAINTS_ATTR,
  constraintsJson,
  elementsByCid,
  freshCid,
  MAX_CONSTRAINTS,
  metadataOf,
  readConstraints,
  sketchElements,
} from './constraint-storage';

/** One picked entity: an element and its part (`top`, `p1`, `center`, …). */
export interface EntityPick {
  node: NodeRef;
  part: string;
}

/** An entity's value: one of point, line, circle. */
export interface EntityValue {
  point?: Point;
  line?: Line;
  circle?: Circle;
}

export type ConstraintError = 'noDocument' | 'invalid' | 'conflict' | 'full' | 'unknown';

/** The state of one asset's sketch for a solve. */
interface Sketch {
  asset: string;
  root: Element;
  /** Element → cid (existing and new ones). */
  cids: Map<Element, string>;
  fresh: Set<Element>;
  sys: SketchSystem;
  list: Constraint[];
}

/** Length of a line, radius of a circle (∞ for a point). */
function sizeOf(sys: SketchSystem, ref: string, v: readonly number[]): number {
  const e = entityOf(sys, ref);
  if (e?.kind === 'line') {
    const l = e.at(v);
    return Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
  }
  return e?.kind === 'circle' ? e.at(v).r : Infinity;
}

/** The lines and circles of `list` that collapsed at `x` (and were not collapsed before). */
function collapsed(sys: SketchSystem, list: readonly Constraint[], x: readonly number[]): string[] {
  const refs = new Set(list.flatMap((c) => c.refs));
  return [...refs].filter((r) => sizeOf(sys, r, x) < 1e-3 && sizeOf(sys, r, sys.x0) >= 1e-3);
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Constraints and driving dimensions (prompt 059): adds and removes them, changes a dimension's
 * value, re-solves an asset and drags a constrained point – each as document commands (the
 * geometry, the new `data-cid`s and the stored list in one undo step). A change that cannot be
 * solved is refused and leaves the document as it was.
 */
@Injectable({ providedIn: 'root' })
export class ConstraintService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private drag: { asset: string; ref: string; live: boolean } | null = null;

  /** The constraints of an asset. */
  list(asset: string): Constraint[] {
    const root = this.root(asset);
    return root ? readConstraints(root) : [];
  }

  private root(asset: string): Element | null {
    return this.files.store()?.document().asset(asset)?.svg?.root ?? null;
  }

  private matrixOf = (el: Element): Matrix | null => {
    const host = this.view.host;
    // jsdom (unit tests) has no layout: user space = document units
    if (!host || !(el instanceof SVGGraphicsElement) || typeof el.getScreenCTM !== 'function') {
      return IDENTITY;
    }
    const m = nodeToDocument(host, el);
    return m ? fromDom(m) : null;
  };

  private sketch(asset: string, extra: readonly Element[] = []): Sketch | null {
    const root = this.root(asset);
    if (!root) return null;
    const cids = new Map<Element, string>();
    for (const [cid, el] of elementsByCid(root)) cids.set(el, cid);
    const fresh = new Set<Element>();
    const taken = new Set(cids.values());
    for (const el of root.querySelectorAll(`[${CID_ATTR}]`)) taken.add(el.getAttribute(CID_ATTR)!);
    for (const el of extra) {
      if (cids.has(el)) continue;
      const cid = freshCid(taken);
      taken.add(cid);
      cids.set(el, cid);
      fresh.add(el);
    }
    const sys = systemOf(sketchElements(cids, this.matrixOf));
    return { asset, root, cids, fresh, sys, list: readConstraints(root) };
  }

  /** `cid.part` of a pick (the element must be in the sketch). */
  private refOf(s: Sketch, p: EntityPick): string | null {
    const el = this.files.store()?.document().node(p.node);
    const cid = el ? s.cids.get(el) : undefined;
    return cid ? `${cid}.${p.part}` : null;
  }

  /** Solves `list` from the current state; `fixed` variables stay. */
  private solveList(s: Sketch, list: readonly Constraint[], fixed?: Set<number>) {
    const { f } = systemResiduals(s.sys, list);
    const r = solve(f, s.sys.x0, { fixed, tolerance: 1e-5 });
    const gone = r.ok ? collapsed(s.sys, list, r.x) : [];
    if (!gone.length) return r;
    // the smallest change may shrink a line to a point (a horizontal line made vertical): try
    // again keeping the sizes of those – then it turns instead; a contradiction (horizontal and
    // vertical at once) still collapses and is refused
    const keep = gone.map((ref, i): Constraint => ({
      id: `_keep${i}`,
      type: entityOf(s.sys, ref)!.kind === 'line' ? 'length' : 'radius',
      refs: [ref],
      value: sizeOf(s.sys, ref, s.sys.x0),
    }));
    // a little nudge off the symmetric start (exactly horizontal has no gradient to turn)
    const start = s.sys.x0.map((v, i) =>
      fixed?.has(i) ? v : v + 0.01 * (((i * 0.618) % 1) - 0.5),
    );
    const again = solve(systemResiduals(s.sys, [...list, ...keep]).f, start, {
      fixed,
      tolerance: 1e-5,
    });
    return again.ok && !collapsed(s.sys, list, again.x).length ? again : { ...r, ok: false };
  }

  /** The commands for a solved state: changed geometry, new cids, the stored list. */
  private commands(s: Sketch, x: readonly number[], list: Constraint[] | null): DocCommand[] {
    const doc = this.files.store()!.document();
    const changes: AttributeChange[] = [];
    for (const [el, cid] of s.cids) {
      const ref = doc.refOf(el);
      const e = s.sys.elements.find((k) => k.cid === cid);
      const o = s.sys.offsets.get(cid);
      if (!ref || !e || o === undefined) continue;
      if (s.fresh.has(el)) changes.push({ ref, name: CID_ATTR, value: cid });
      const now = x.slice(o, o + e.params.length);
      if (now.some((v, i) => Math.abs(v - e.params[i]) > 1e-7)) {
        const before = attributesOf(e.kind, e.params);
        for (const [name, value] of Object.entries(attributesOf(e.kind, now))) {
          if (before[name] !== value || el.getAttribute(name) !== value) {
            changes.push({ ref, name, value });
          }
        }
      }
    }
    const cmds: DocCommand[] = [];
    if (changes.length) cmds.push(new SetAttributes(changes, 'changeAttribute'));
    if (list) {
      const meta = metadataOf(s.root);
      const metaRef = meta ? doc.refOf(meta) : null;
      if (metaRef && list.length)
        cmds.push(new SetText([{ ref: metaRef, text: constraintsJson(list) }]));
      else if (metaRef) cmds.push(new RemoveNode(metaRef));
      else if (list.length) {
        cmds.push(
          new InsertDefinition(
            s.asset,
            `<metadata xmlns="http://www.w3.org/2000/svg" ${CONSTRAINTS_ATTR}="1">${xmlEscape(constraintsJson(list))}</metadata>`,
            'addConstraint',
          ),
        );
      }
    }
    return cmds;
  }

  private run(label: UndoLabel, cmds: DocCommand[]): boolean {
    const store = this.files.store();
    if (!store || !cmds.length) return false;
    store.execute(new CompositeCommand(label, cmds));
    return true;
  }

  private nextId(list: readonly Constraint[]): string {
    const ids = new Set(list.map((c) => c.id));
    let k = list.length + 1;
    while (ids.has(`k${k}`)) k++;
    return `k${k}`;
  }

  /**
   * A new constraint on the picked entities (one asset). Dimensions measure their current value
   * unless `value` is given; `fix` holds the point where it is now.
   */
  add(type: ConstraintType, picks: readonly EntityPick[], value?: number): ConstraintError | true {
    const doc = this.files.store()?.document();
    if (!doc) return 'noDocument';
    const asset = picks[0]?.node.asset;
    if (!asset || picks.some((p) => p.node.asset !== asset)) return 'invalid';
    const els = picks.map((p) => doc.node(p.node));
    if (els.some((e) => !e)) return 'invalid';
    const s = this.sketch(asset, els as Element[]);
    if (!s) return 'invalid';
    if (s.list.length >= MAX_CONSTRAINTS) return 'full';
    const refs = picks.map((p) => this.refOf(s, p));
    if (refs.some((r) => !r)) return 'invalid';
    const c: Constraint = { id: this.nextId(s.list), type, refs: refs as string[] };
    if (!resolve(s.sys, c)) return 'invalid';
    if (type === 'fix') {
      const p = entityOf(s.sys, c.refs[0])!.at(s.sys.x0) as Point;
      c.point = [p.x, p.y];
    }
    if (type === 'tangent' && c.refs.every((r) => entityOf(s.sys, r)?.kind === 'circle')) {
      const [a, b] = c.refs.map((r) => entityOf(s.sys, r)!.at(s.sys.x0) as { c: Point; r: number });
      const d = Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y);
      c.internal = Math.abs(d - Math.abs(a.r - b.r)) < Math.abs(d - (a.r + b.r));
    }
    if (isDimension(type)) {
      const m = measure(s.sys, c);
      if (m === null) return 'invalid';
      c.value = value ?? (type === 'distance' || type === 'length' ? Math.abs(m) : m);
      if (type === 'angle' && value !== undefined && Math.sign(value) !== Math.sign(m)) {
        c.value = Math.sign(m || 1) * Math.abs(value);
      }
    }
    const list = [...s.list, c];
    const r = this.solveList(s, list);
    if (!r.ok) return 'conflict';
    return this.run('addConstraint', this.commands(s, r.x, list)) || 'unknown';
  }

  remove(asset: string, id: string): boolean {
    const s = this.sketch(asset);
    if (!s || !s.list.some((c) => c.id === id)) return false;
    return this.run(
      'removeConstraint',
      this.commands(
        s,
        s.sys.x0,
        s.list.filter((c) => c.id !== id),
      ),
    );
  }

  /** A driving dimension gets a new value; the geometry follows. */
  setValue(asset: string, id: string, value: number): ConstraintError | true {
    const s = this.sketch(asset);
    const c = s?.list.find((k) => k.id === id);
    if (!s || !c || !isDimension(c.type) || !Number.isFinite(value)) return 'invalid';
    if (c.type !== 'angle' && value <= 0) return 'invalid';
    const v = c.type === 'angle' ? Math.sign(c.value || 1) * Math.abs(value) : value;
    const list = s.list.map((k) => (k.id === id ? { ...k, value: v } : k));
    const r = this.solveList(s, list);
    if (!r.ok) return 'conflict';
    return this.run('changeDimension', this.commands(s, r.x, list)) || true;
  }

  /** Brings the geometry of an asset back in line with its constraints (after free edits). */
  solveAsset(asset: string): ConstraintError | true {
    const s = this.sketch(asset);
    if (!s) return 'invalid';
    if (!s.list.length) return true;
    const r = this.solveList(s, s.list);
    if (!r.ok) return 'conflict';
    this.run('solveConstraints', this.commands(s, r.x, null));
    return true;
  }

  /** The assets that have constraints. */
  assets(): string[] {
    const doc = this.files.store()?.document();
    if (!doc) return [];
    return [...doc.assets.values()]
      .filter((a) => a.svg && metadataOf(a.svg.root))
      .map((a) => a.name);
  }

  /** The constraints of an asset and their entities now, in document units (the overlay). */
  snapshot(asset: string): { list: Constraint[]; at: (ref: string) => EntityValue | null } | null {
    const s = this.sketch(asset);
    if (!s) return null;
    return {
      list: s.list,
      at: (ref) => {
        const e = entityOf(s.sys, ref);
        if (!e) return null;
        if (e.kind === 'point') return { point: e.at(s.sys.x0) };
        if (e.kind === 'line') return { line: e.at(s.sys.x0) };
        return { circle: e.at(s.sys.x0) };
      },
    };
  }

  /** Whether an asset's constraints hold now. */
  holds(asset: string): boolean {
    const s = this.sketch(asset);
    if (!s) return true;
    const { f } = systemResiduals(s.sys, s.list);
    return f(s.sys.x0).every((v) => Math.abs(v) < 1e-2);
  }

  /** Starts dragging the point `ref` (`cid.part`) of `asset` – one undo step until {@link dragEnd}. */
  dragBegin(asset: string, ref: string): boolean {
    const store = this.files.store();
    if (!store) return false;
    this.drag = { asset, ref, live: false };
    return true;
  }

  /**
   * Moves the dragged point to `to` (document units); the solver keeps the constraints. A place
   * the point cannot reach leaves it at the last one that worked.
   */
  dragTo(to: Point): boolean {
    const d = this.drag;
    const store = this.files.store();
    const s = d ? this.sketch(d.asset) : null;
    if (!d || !s || !store) return false;
    const point = entityOf(s.sys, d.ref);
    if (point?.kind !== 'point') return false;
    const target: Constraint = { id: '_drag', type: 'fix', refs: [d.ref], point: [to.x, to.y] };
    const r = this.solveList(s, [...s.list, target]);
    if (!r.ok) return false;
    const cmds = this.commands(s, r.x, null);
    if (!cmds.length) return true;
    if (!d.live) {
      store.begin('moveConstrained');
      d.live = true;
    }
    for (const c of cmds) store.update(c);
    return true;
  }

  dragEnd(keep = true): void {
    const d = this.drag;
    this.drag = null;
    const store = this.files.store();
    if (!d?.live || !store) return;
    if (keep) store.commit();
    else store.cancel();
  }
}
