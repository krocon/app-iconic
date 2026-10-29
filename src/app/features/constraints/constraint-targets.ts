import {
  Circle,
  EntityKind,
  Line,
  partsOf,
  entityOf,
  paramsOf,
  systemOf,
} from '../../shared/geometry/constraints/sketch-model';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { fromDom } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { paintedRoots } from '../canvas/hit-test';
import { IconDocument, NodeRef } from '../document/icon-document';
import { CID_ATTR, constrainableIn } from './constraint-storage';

/** One thing the constraint tool can pick (prompt 059): a point, a line or a circle, in document units. */
export interface ConstraintTarget {
  node: NodeRef;
  cid: string | null;
  part: string;
  kind: EntityKind;
  point?: Point;
  line?: Line;
  circle?: Circle;
}

/** Most targets collected (huge imported icons). */
const MAX_TARGETS = 20_000;

/** The parts of every painted constrainable element, measured by the browser. */
export function collectTargets(
  doc: IconDocument,
  layers: HTMLElement | null,
  host: SVGSVGElement | null,
): ConstraintTarget[] {
  if (!layers || !host) return [];
  const out: ConstraintTarget[] = [];
  for (const { root } of paintedRoots(layers)) {
    for (const el of constrainableIn(root)) {
      if (out.length > MAX_TARGETS) return out;
      const node = doc.refOf(el);
      const p = paramsOf(el.localName, (n) => el.getAttribute(n));
      const m = el instanceof SVGGraphicsElement ? nodeToDocument(host, el) : null;
      if (!node || !p || !m) continue;
      const e = { cid: 'e', kind: p.kind, params: p.params, m: fromDom(m), closed: p.closed };
      const sys = systemOf([e]);
      for (const { part, kind } of partsOf(e)) {
        const ent = entityOf(sys, `e.${part}`);
        if (!ent) continue;
        const t: ConstraintTarget = { node, cid: el.getAttribute(CID_ATTR), part, kind };
        if (ent.kind === 'point') t.point = ent.at(sys.x0);
        else if (ent.kind === 'line') t.line = ent.at(sys.x0);
        else t.circle = ent.at(sys.x0);
        out.push(t);
      }
    }
  }
  return out;
}

function segmentDistance(p: Point, l: Line): number {
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 > 0 ? Math.max(0, Math.min(1, ((p.x - l.a.x) * dx + (p.y - l.a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (l.a.x + t * dx), p.y - (l.a.y + t * dy));
}

/** Distance of `p` to a target. */
export function targetDistance(t: ConstraintTarget, p: Point): number {
  if (t.point) return Math.hypot(p.x - t.point.x, p.y - t.point.y);
  if (t.line) return segmentDistance(p, t.line);
  if (t.circle) return Math.abs(Math.hypot(p.x - t.circle.c.x, p.y - t.circle.c.y) - t.circle.r);
  return Infinity;
}

/** The nearest accepted target within `tol` – points win over lines and circles. */
export function nearestTarget(
  targets: readonly ConstraintTarget[],
  p: Point,
  tol: number,
  accept: (t: ConstraintTarget) => boolean = () => true,
): ConstraintTarget | null {
  let best: { t: ConstraintTarget; d: number } | null = null;
  for (const t of targets) {
    if (!accept(t)) continue;
    const d = targetDistance(t, p);
    if (d > tol) continue;
    // a point counts as nearer than an edge at the same distance
    const score = t.kind === 'point' ? d - tol : d;
    if (!best || score < best.d) best = { t, d: score };
  }
  return best?.t ?? null;
}

/** Anchor of a target for badges: the point, the middle of the line, the top of the circle. */
export function anchorOf(t: Pick<ConstraintTarget, 'point' | 'line' | 'circle'>): Point | null {
  if (t.point) return t.point;
  if (t.line) return { x: (t.line.a.x + t.line.b.x) / 2, y: (t.line.a.y + t.line.b.y) / 2 };
  if (t.circle) return { x: t.circle.c.x, y: t.circle.c.y - t.circle.r };
  return null;
}
