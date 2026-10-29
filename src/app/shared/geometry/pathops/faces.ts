import { Point } from '../view-transform';
import { PaperScope } from './boolean-ops';

/**
 * The faces of an arrangement of outlines (prompt 060, Live Paint like Illustrator / profiles in a
 * Fusion sketch): every outline – closed or open, line, arc, Bézier – is cut at every crossing
 * into edges, dangling ends are pruned, and the faces of the planar graph are traced (at each
 * vertex the next edge in angle order). `faceAt` gives the smallest face around a point, minus the
 * separate islands inside it. Curve-exact with paper.js; one coordinate space (document units).
 */

type PPath = paper.Path;

interface Edge {
  path: PPath;
  a: number;
  b: number;
}

interface HalfEdge {
  edge: number;
  forward: boolean;
  from: number;
  to: number;
  angle: number;
}

/** Most edges an arrangement takes (huge icons). */
const MAX_EDGES = 4000;
const EPS = 1e-6;

/** The open part of `path` from offset `a` to `b`. */
function part(path: PPath, a: number, b: number): PPath | null {
  const c = path.clone({ insert: false }) as PPath;
  if (b < c.length - EPS) c.splitAt(b);
  if (a > EPS) return (c.splitAt(a) as PPath | null) ?? null;
  return c;
}

/** Every subpath of the outlines as its own path. */
function subpaths(scope: PaperScope, outlines: readonly string[]): PPath[] {
  const out: PPath[] = [];
  for (const d of outlines) {
    if (!d.trim()) continue;
    const c = new scope.CompoundPath({ pathData: d, insert: false });
    for (const k of c.children as PPath[]) {
      if (k.segments.length > 1 && k.length > EPS) out.push(k.clone({ insert: false }) as PPath);
    }
  }
  return out;
}

/** The arrangement: edges between vertices (merged within `tol`), dangling ends pruned. */
export class Arrangement {
  readonly vertices: Point[] = [];
  readonly edges: Edge[] = [];
  private cycles: { path: PPath; area: number; component: number }[] | null = null;
  private comp: number[] = [];

  constructor(
    private readonly scope: PaperScope,
    outlines: readonly string[],
    private readonly tol = 0.01,
  ) {
    const paths = subpaths(scope, outlines);
    const cuts = paths.map(() => [] as number[]);
    for (let i = 0; i < paths.length; i++) {
      for (const loc of paths[i].getIntersections(paths[i])) {
        cuts[i].push(loc.offset);
      }
      for (let j = i + 1; j < paths.length; j++) {
        if (!paths[i].bounds.expand(tol).intersects(paths[j].bounds)) continue;
        for (const loc of paths[i].getIntersections(paths[j])) {
          cuts[i].push(loc.offset);
          if (loc.intersection) cuts[j].push(loc.intersection.offset);
        }
      }
    }
    paths.forEach((p, i) => this.split(p, cuts[i]));
    this.prune();
  }

  private vertex(p: paper.Point): number {
    const i = this.vertices.findIndex((v) => Math.hypot(v.x - p.x, v.y - p.y) <= this.tol);
    if (i >= 0) return i;
    this.vertices.push({ x: p.x, y: p.y });
    return this.vertices.length - 1;
  }

  private add(path: PPath | null): void {
    if (!path || path.length <= EPS || this.edges.length >= MAX_EDGES) return;
    const a = this.vertex(path.firstSegment.point);
    const b = this.vertex(path.lastSegment.point);
    if (a === b && path.length < 4 * this.tol) return;
    this.edges.push({ path, a, b });
  }

  private split(path: PPath, raw: number[]): void {
    const len = path.length;
    let offs = [...new Set(raw.map((o) => Math.round(o * 1e6) / 1e6))]
      .filter((o) => o > -EPS && o < len + EPS)
      .sort((x, y) => x - y);
    let p = path;
    if (path.closed) {
      // open it at the first cut (or anywhere): a loop is one edge from a vertex to itself
      const at = offs.length ? offs[0] : 0;
      p = path.clone({ insert: false }) as PPath;
      p.splitAt(at);
      const l2 = p.length;
      offs = offs.map((o) => (o - at + len) % len).filter((o) => o > EPS && o < l2 - EPS);
    } else {
      offs = offs.filter((o) => o > EPS && o < len - EPS);
    }
    const stops = [0, ...offs, p.length];
    for (let k = 0; k + 1 < stops.length; k++) {
      if (stops[k + 1] - stops[k] > EPS) this.add(part(p, stops[k], stops[k + 1]));
    }
  }

  /** Edges with an end nobody else touches lead nowhere – away with them, again and again. */
  private prune(): void {
    for (;;) {
      const deg = new Array<number>(this.vertices.length).fill(0);
      for (const e of this.edges) {
        deg[e.a]++;
        deg[e.b]++;
      }
      const keep = this.edges.filter((e) => deg[e.a] > 1 && deg[e.b] > 1);
      if (keep.length === this.edges.length) return;
      this.edges.splice(0, this.edges.length, ...keep);
    }
  }

  /** Direction leaving a vertex along an edge (a little way in, so curves sort right). */
  private angleOf(e: Edge, forward: boolean): number {
    const len = e.path.length;
    const d = Math.min(len * 0.05, this.tol * 20);
    const from = forward ? e.path.getPointAt(0) : e.path.getPointAt(len);
    const to = forward ? e.path.getPointAt(d) : e.path.getPointAt(len - d);
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  /** All face cycles (bounded and outer), traced once. */
  private trace() {
    if (this.cycles) return this.cycles;
    const half: HalfEdge[] = [];
    this.edges.forEach((e, i) => {
      half.push({ edge: i, forward: true, from: e.a, to: e.b, angle: this.angleOf(e, true) });
      half.push({ edge: i, forward: false, from: e.b, to: e.a, angle: this.angleOf(e, false) });
    });
    const out = this.vertices.map(() => [] as number[]);
    half.forEach((h, i) => out[h.from].push(i));
    for (const list of out) list.sort((x, y) => half[x].angle - half[y].angle);
    // connected components (for the islands)
    const parent = this.vertices.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const e of this.edges) parent[find(e.a)] = find(e.b);
    this.comp = this.vertices.map((_, i) => find(i));
    const used = new Array<boolean>(half.length).fill(false);
    const cycles: { path: PPath; area: number; component: number }[] = [];
    for (let s = 0; s < half.length; s++) {
      if (used[s]) continue;
      const seq: number[] = [];
      let h = s;
      let guard = 0;
      while (!used[h] && guard++ < half.length + 1) {
        used[h] = true;
        seq.push(h);
        const twin = h ^ 1;
        const list = out[half[h].to];
        const i = list.indexOf(twin);
        h = list[(i - 1 + list.length) % list.length];
      }
      if (h !== s) continue;
      const path = this.cyclePath(seq.map((k) => half[k]));
      if (path) cycles.push({ path, area: path.area, component: this.comp[half[s].from] });
    }
    this.cycles = cycles;
    return cycles;
  }

  private cyclePath(hs: HalfEdge[]): PPath | null {
    const result = new this.scope.Path({ insert: false });
    for (const h of hs) {
      const piece = this.edges[h.edge].path.clone({ insert: false }) as PPath;
      if (!h.forward) piece.reverse();
      if (!result.segments.length) {
        result.addSegments(piece.segments.map((g) => g.clone()));
        continue;
      }
      result.lastSegment.handleOut = piece.firstSegment.handleOut.clone();
      result.addSegments(piece.segments.slice(1).map((g) => g.clone()));
    }
    if (result.segments.length < 2) return null;
    const first = result.firstSegment;
    const last = result.lastSegment;
    if (first.point.getDistance(last.point) <= this.tol * 2) {
      first.handleIn = last.handleIn.clone();
      last.remove();
    }
    result.closed = true;
    return result;
  }

  /**
   * The faces are the cycles of one orientation; the other one is the outside of each component.
   * Which sign that is follows from the tracing rule: in every component the cycle with the
   * largest area is its outside.
   */
  private bounded() {
    const cycles = this.trace();
    const outer = new Map<number, number>();
    cycles.forEach((c, i) => {
      const o = outer.get(c.component);
      if (o === undefined || Math.abs(c.area) > Math.abs(cycles[o].area) + 1e-9) {
        outer.set(c.component, i);
      }
    });
    const sign =
      [...outer.values()].map((i) => Math.sign(cycles[i].area)).find((s) => s !== 0) ?? 1;
    return {
      faces: cycles.filter((c) => Math.sign(c.area) === -sign && Math.abs(c.area) > 1e-6),
      outsides: cycles.filter((c) => Math.sign(c.area) === sign),
    };
  }

  /** The face around `p` (path data, holes for islands inside it), or `null`. */
  faceAt(p: Point): string | null {
    const pt = new this.scope.Point(p.x, p.y);
    const { faces, outsides } = this.bounded();
    let best: (typeof faces)[number] | null = null;
    for (const f of faces) {
      if (!f.path.contains(pt)) continue;
      if (!best || Math.abs(f.area) < Math.abs(best.area)) best = f;
    }
    if (!best) return null;
    let shape: paper.PathItem = best.path.clone({ insert: false }) as PPath;
    for (const o of outsides) {
      if (o.component === best.component || o.path.contains(pt)) continue;
      const inner = o.path.interiorPoint;
      if (!best.path.contains(o.path.firstSegment.point) || !best.path.contains(inner)) continue;
      shape = shape.subtract(o.path, { insert: false });
    }
    return shape.pathData || null;
  }
}

/** One face around `p` of the outlines (convenience), `null` if `p` is in no closed face. */
export function faceAt(scope: PaperScope, outlines: readonly string[], p: Point, tol = 0.01) {
  return new Arrangement(scope, outlines, tol).faceAt(p);
}

/** Several faces as one shape (they share edges: united). */
export function unionOf(scope: PaperScope, ds: readonly string[]): string {
  let acc: paper.PathItem | null = null;
  for (const d of ds) {
    const p = new scope.CompoundPath({ pathData: d, insert: false });
    acc = acc ? acc.unite(p, { insert: false }) : p;
  }
  return acc?.pathData ?? '';
}

/** A point well inside a face (where its seed goes after the face moved). */
export function insidePoint(scope: PaperScope, d: string): Point | null {
  const p = new scope.CompoundPath({ pathData: d, insert: false });
  const q = p.interiorPoint;
  return q ? { x: q.x, y: q.y } : null;
}
