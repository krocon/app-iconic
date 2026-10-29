// Übertragen aus Marcs VectorCraft, crates/geom/src/shapes.rs (`star`, `spiral`, `arc`,
// `rectangular_grid`, `polar_grid`) und crates/tools/src/shape.rs (`straight_ratio`; MIT/Apache),
// Prompt 044.
import { PenAnchor } from '../pen/pen-path';
import { Point } from '../view-transform';

/**
 * More shapes of the drag tools (prompt 044): star, spiral, quarter arc, rectangular and polar
 * grid – as subpaths of anchors (one `<path>`). Document units, y down. Pure.
 */

export interface Subpath {
  anchors: PenAnchor[];
  closed: boolean;
}

/** Circle arcs as cubics: the handle length of a quarter turn. */
export const KAPPA = 0.5522847498307936;

const corner = (p: Point): PenAnchor => ({ p, hin: null, hout: null });

/** A star of `points` tips, radii `r1` (tips) and `r2`, the first tip at `angle` (radians). */
export function star(c: Point, r1: number, r2: number, points: number, angle: number): Subpath {
  const n = Math.max(2, Math.round(points)) * 2;
  const anchors = Array.from({ length: n }, (_, i) => {
    const r = i % 2 === 0 ? r1 : r2;
    const a = angle + (2 * Math.PI * i) / n;
    return corner({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
  });
  return { anchors, closed: true };
}

/** The inner / outer radius ratio of a star with straight shoulders; `null` under five points. */
export function straightRatio(points: number): number | null {
  return points >= 5 ? Math.cos((2 * Math.PI) / points) / Math.cos(Math.PI / points) : null;
}

/**
 * A spiral of `segments` quarter turns from radius `radius` inwards (each turn `decay` of the one
 * before), starting at `angle`; it begins at its inner end like VectorCraft's.
 */
export function spiral(
  c: Point,
  radius: number,
  segments: number,
  angle = 0,
  clockwise = true,
  decay = 0.8,
): Subpath {
  const dir = clockwise ? 1 : -1;
  const anchors: PenAnchor[] = [];
  let r = radius;
  const n = Math.max(1, Math.round(segments));
  for (let i = 0; i <= n; i++) {
    const a = angle + (dir * i * Math.PI) / 2;
    const p = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
    const t = { x: -Math.sin(a) * dir, y: Math.cos(a) * dir };
    const inLen = (KAPPA * (r + r / decay)) / 2;
    const outLen = (KAPPA * (r + r * decay)) / 2;
    anchors.push({
      p,
      hin: i === 0 ? null : { x: p.x - t.x * inLen, y: p.y - t.y * inLen },
      hout: i === n ? null : { x: p.x + t.x * outLen, y: p.y + t.y * outLen },
    });
    r *= decay;
  }
  // from the centre end outwards
  const rev = anchors.reverse().map((x) => ({ p: x.p, hin: x.hout ?? null, hout: x.hin ?? null }));
  return { anchors: rev, closed: false };
}

/**
 * A quarter ellipse from `a` to `b` (the Arc tool): `slope` −100 … 100 (concave … convex), 0 a
 * straight chord; `closed` adds the corner.
 */
export function quarterArc(a: Point, b: Point, slope = 50, closed = false): Subpath {
  const t = Math.max(-100, Math.min(100, slope)) / 100;
  const c = t >= 0 ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  const k = KAPPA * Math.abs(t);
  const h1 = { x: a.x + (c.x - a.x) * k, y: a.y + (c.y - a.y) * k };
  const h2 = { x: b.x + (c.x - b.x) * k, y: b.y + (c.y - b.y) * k };
  const anchors: PenAnchor[] = [
    { p: a, hin: null, hout: k === 0 ? null : h1 },
    { p: b, hin: k === 0 ? null : h2, hout: null },
  ];
  if (closed) anchors.push(corner({ x: a.x, y: b.y }));
  return { anchors, closed };
}

/** An axis-aligned ellipse as four quarter arcs (closed). */
export function ellipseSubpath(c: Point, rx: number, ry: number): Subpath {
  const kx = KAPPA * rx;
  const ky = KAPPA * ry;
  return {
    anchors: [
      {
        p: { x: c.x + rx, y: c.y },
        hin: { x: c.x + rx, y: c.y - ky },
        hout: { x: c.x + rx, y: c.y + ky },
      },
      {
        p: { x: c.x, y: c.y + ry },
        hin: { x: c.x + kx, y: c.y + ry },
        hout: { x: c.x - kx, y: c.y + ry },
      },
      {
        p: { x: c.x - rx, y: c.y },
        hin: { x: c.x - rx, y: c.y + ky },
        hout: { x: c.x - rx, y: c.y - ky },
      },
      {
        p: { x: c.x, y: c.y - ry },
        hin: { x: c.x - kx, y: c.y - ry },
        hout: { x: c.x + kx, y: c.y - ry },
      },
    ],
    closed: true,
  };
}

/** A rectangle with round corners (radius `r`, clamped to half the sides) as one closed subpath. */
export function roundRectSubpath(c: Point, w: number, h: number, r: number): Subpath {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const [x0, y0, x1, y1] = [c.x - w / 2, c.y - h / 2, c.x + w / 2, c.y + h / 2];
  const k = rr * (1 - KAPPA);
  const p = (x: number, y: number) => ({ x, y });
  if (!(rr > 0)) {
    // without radius four corners, no doubled points
    return {
      anchors: [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)].map(corner),
      closed: true,
    };
  }
  return {
    anchors: [
      { p: p(x0 + rr, y0), hin: p(x0 + k, y0), hout: null },
      { p: p(x1 - rr, y0), hin: null, hout: p(x1 - k, y0) },
      { p: p(x1, y0 + rr), hin: p(x1, y0 + k), hout: null },
      { p: p(x1, y1 - rr), hin: null, hout: p(x1, y1 - k) },
      { p: p(x1 - rr, y1), hin: p(x1 - k, y1), hout: null },
      { p: p(x0 + rr, y1), hin: null, hout: p(x0 + k, y1) },
      { p: p(x0, y1 - rr), hin: p(x0, y1 - k), hout: null },
      { p: p(x0, y0 + rr), hin: null, hout: p(x0, y0 + k) },
    ],
    closed: true,
  };
}

const line = (a: Point, b: Point): Subpath => ({ anchors: [corner(a), corner(b)], closed: false });

/** A rectangular grid in the box `x0 y0 – x1 y1`: the frame and `h` / `v` dividers. */
export function rectGrid(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  v: number,
): Subpath[] {
  const out: Subpath[] = [
    {
      anchors: [
        corner({ x: x0, y: y0 }),
        corner({ x: x1, y: y0 }),
        corner({ x: x1, y: y1 }),
        corner({ x: x0, y: y1 }),
      ],
      closed: true,
    },
  ];
  for (let i = 1; i <= h; i++) {
    const y = y0 + ((y1 - y0) * i) / (h + 1);
    out.push(line({ x: x0, y }, { x: x1, y }));
  }
  for (let i = 1; i <= v; i++) {
    const x = x0 + ((x1 - x0) * i) / (v + 1);
    out.push(line({ x, y: y0 }, { x, y: y1 }));
  }
  return out;
}

/** A polar grid in the box: `concentric` + 1 ellipses from the outside in and `radial` dividers from the top. */
export function polarGrid(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  concentric: number,
  radial: number,
): Subpath[] {
  const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const rx = Math.abs(x1 - x0) / 2;
  const ry = Math.abs(y1 - y0) / 2;
  const out: Subpath[] = [];
  for (let i = concentric + 1; i >= 1; i--) {
    const f = i / (concentric + 1);
    out.push(ellipseSubpath(c, rx * f, ry * f));
  }
  for (let i = 0; i < radial; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / radial;
    out.push(line(c, { x: c.x + rx * Math.cos(a), y: c.y + ry * Math.sin(a) }));
  }
  return out;
}
