import type PaperCore from 'paper/dist/paper-core';
import { Point } from '../view-transform';

/**
 * Boolean operations on filled paths (prompt 047): Pathfinder (unite, minus front, intersect,
 * exclude, divide), the regions of the Shape Builder and the cuts of Knife / Line / Rectangle Cut –
 * curve-preserving with paper.js (MIT, `docs/architecture.md`), loaded on first use. Path data in
 * one coordinate space (document units); open subpaths count as closed (a filled open path).
 */

export type PaperScope = paper.PaperScope;
type PathItem = paper.PathItem;

export type PathfinderOp = 'unite' | 'minusFront' | 'intersect' | 'exclude';
export const PATHFINDER_OPS: readonly PathfinderOp[] = [
  'unite',
  'minusFront',
  'intersect',
  'exclude',
];

/** Areas below this (square units) are dust the operations leave and nobody wants. */
export const MIN_AREA = 1e-3;

let loading: Promise<PaperScope> | null = null;

/** paper.js, once per process, headless (no canvas, no view). */
export function loadPaper(): Promise<PaperScope> {
  loading ??= import('paper/dist/paper-core').then((m) => {
    const core = ((m as { default?: unknown }).default ?? m) as typeof PaperCore;
    const scope = new core.PaperScope();
    scope.setup(new scope.Size(1, 1));
    scope.settings.insertItems = false;
    return scope;
  });
  return loading;
}

function item(scope: PaperScope, d: string, evenOdd = false): PathItem {
  const p = new scope.CompoundPath({ pathData: d, insert: false });
  p.fillRule = evenOdd ? 'evenodd' : 'nonzero';
  for (const c of p.children as paper.Path[]) c.closed = true;
  return p;
}

const dataOf = (p: PathItem): string => (Math.abs(area(p)) > MIN_AREA ? p.pathData : '');

/** The covered area (orientation of the contours does not matter). */
function area(p: PathItem): number {
  const c = p.clone({ insert: false }) as PathItem;
  c.reorient(true, true);
  return (c as unknown as { area: number }).area ?? 0;
}

export interface Shape {
  d: string;
  evenOdd?: boolean;
}

/**
 * Pathfinder of `shapes` in z-order (back first): unite, minus front (the backmost minus all
 * others), intersect (what all share), exclude (odd overlaps). `''` = nothing left.
 */
export function pathfinder(scope: PaperScope, op: PathfinderOp, shapes: readonly Shape[]): string {
  const items = shapes.map((s) => item(scope, s.d, s.evenOdd));
  if (!items.length) return '';
  let acc = items[0];
  if (op === 'minusFront') {
    const rest = items.slice(1).reduce<PathItem | null>((u, x) => (u ? u.unite(x) : x), null);
    return rest ? dataOf(acc.subtract(rest)) : dataOf(acc);
  }
  for (const x of items.slice(1)) {
    acc = op === 'unite' ? acc.unite(x) : op === 'intersect' ? acc.intersect(x) : acc.exclude(x);
  }
  return dataOf(op === 'unite' && items.length === 1 ? acc.unite(acc) : acc);
}

/** A region of the arrangement: its outline and the frontmost shape covering it (its look). */
export interface Region {
  d: string;
  source: number;
}

/**
 * Divide: every face of the arrangement of `shapes` (z-order, back first) as its own region,
 * the frontmost covering shape its source. A face of several pieces stays one region per piece.
 */
export function divide(scope: PaperScope, shapes: readonly Shape[]): Region[] {
  let regions: { p: PathItem; source: number }[] = [];
  shapes.forEach((s, i) => {
    const x = item(scope, s.d, s.evenOdd);
    const next: { p: PathItem; source: number }[] = [];
    let rest: PathItem = x;
    for (const r of regions) {
      const inside = r.p.intersect(x);
      const outside = r.p.subtract(x);
      if (Math.abs(area(inside)) > MIN_AREA) next.push({ p: inside, source: i });
      if (Math.abs(area(outside)) > MIN_AREA) next.push({ p: outside, source: r.source });
      rest = rest.subtract(r.p);
    }
    if (Math.abs(area(rest)) > MIN_AREA) next.push({ p: rest, source: i });
    regions = next;
  });
  return regions.flatMap((r) => pieces(scope, r.p.pathData).map((d) => ({ d, source: r.source })));
}

/** The separate pieces of a path: each outer contour with the holes inside it. */
export function pieces(scope: PaperScope, d: string): string[] {
  if (!d) return [];
  const p = new scope.CompoundPath({ pathData: d, insert: false });
  p.reorient(true, true);
  const kids = [...(p.children as paper.Path[])].filter((c) => Math.abs(c.area) > MIN_AREA);
  const outers = kids.filter((c) => c.clockwise);
  const holes = kids.filter((c) => !c.clockwise);
  if (outers.length <= 1) return [dataOf(p)].filter(Boolean);
  return outers.map((o) => {
    const mine = holes.filter(
      (h) =>
        o.contains(h.interiorPoint) &&
        !outers.some(
          (x) =>
            x !== o &&
            x.area < o.area &&
            x.contains(h.interiorPoint) &&
            o.contains(x.interiorPoint),
        ),
    );
    return new scope.CompoundPath({
      children: [o.clone({ insert: false }), ...mine.map((h) => h.clone({ insert: false }))],
      insert: false,
    }).pathData;
  });
}

/** Whether `p` lies inside the region `d`. */
export function contains(scope: PaperScope, d: string, p: Point): boolean {
  return item(scope, d).contains(new scope.Point(p.x, p.y));
}

/** One path of the regions `ds` united. */
export function uniteAll(scope: PaperScope, ds: readonly string[]): string {
  const items = ds.map((d) => item(scope, d));
  if (!items.length) return '';
  return dataOf(items.slice(1).reduce((u, x) => u.unite(x), items[0].unite(items[0])));
}

/**
 * Knife / Line Cut: the shape `d` cut along the polyline `cut` (a band of width `gap`) into
 * its pieces; the shape unchanged (one piece) when the cut does not go through it.
 */
export function cutAlong(
  scope: PaperScope,
  d: string,
  cut: readonly Point[],
  gap: number,
): string[] {
  if (cut.length < 2) return pieces(scope, d);
  const line = new scope.Path({ segments: cut.map((p) => [p.x, p.y]), insert: false });
  const band = bandOf(scope, line, gap / 2);
  return pieces(scope, item(scope, d).subtract(band).pathData);
}

/** Rectangle Cut: the shape `d` split by the rectangle into what is inside and what is outside. */
export function cutByRect(
  scope: PaperScope,
  d: string,
  r: { x: number; y: number; width: number; height: number },
): string[] {
  const rect = new scope.Path.Rectangle({
    point: [r.x, r.y],
    size: [r.width, r.height],
    insert: false,
  });
  const shape = item(scope, d);
  return [
    ...pieces(scope, shape.intersect(rect).pathData),
    ...pieces(scope, shape.subtract(rect).pathData),
  ];
}

/** A thin closed band around the polyline (each segment a quad, united). */
function bandOf(scope: PaperScope, line: paper.Path, h: number): PathItem {
  let band: PathItem | null = null;
  const segs = line.segments;
  for (let i = 0; i + 1 < segs.length; i++) {
    const a = segs[i].point;
    const b = segs[i + 1].point;
    const dir = b.subtract(a);
    if (dir.length < 1e-9) continue;
    const n = new scope.Point(-dir.y, dir.x).normalize(h);
    const t = dir.normalize(h);
    const q = new scope.Path({
      segments: [
        a.subtract(t).add(n),
        b.add(t).add(n),
        b.add(t).subtract(n),
        a.subtract(t).subtract(n),
      ],
      closed: true,
      insert: false,
    });
    band = band ? band.unite(q) : q;
  }
  return band ?? new scope.Path({ insert: false });
}
