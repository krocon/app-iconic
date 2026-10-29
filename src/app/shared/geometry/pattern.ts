import { Matrix } from './matrix';
import { Point } from './view-transform';

/**
 * Patterns like Fusion 360 (prompt 049): the placements of the copies as matrices in document
 * space – circular (around a centre, full turn or a total angle), rectangular (columns × rows with
 * a spacing) and the mirror across a line. The original is placement 0 and not part of the
 * result. Pure.
 */

/** Most copies one pattern makes (a pattern of 20 000 shapes helps nobody). */
export const MAX_PATTERN_COPIES = 1000;

/** Rotation by `deg` (clockwise on screen, y down) around `c`. */
export function rotationAbout(c: Point, deg: number): Matrix {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: c.x - cos * c.x + sin * c.y,
    f: c.y - sin * c.x - cos * c.y,
  };
}

/**
 * The circular pattern: `count` placements (with the original) around `c`; `angle` = the total
 * angle – a full turn spreads them evenly (360 / count), less spreads them from the first to the
 * last on that angle (Fusion's "Full" / "Angle" distribution).
 */
export function circularPlacements(c: Point, count: number, angle = 360): Matrix[] {
  const n = Math.min(Math.max(Math.round(count), 1), MAX_PATTERN_COPIES + 1);
  if (n < 2) return [];
  const full = Math.abs(Math.abs(angle) - 360) < 1e-9;
  const step = full ? angle / n : angle / (n - 1);
  return Array.from({ length: n - 1 }, (_, i) => rotationAbout(c, step * (i + 1)));
}

/** The rectangular pattern: `columns` × `rows` placements, `dx` / `dy` apart (may be negative). */
export function rectangularPlacements(
  columns: number,
  rows: number,
  dx: number,
  dy: number,
): Matrix[] {
  const cs = Math.max(Math.round(columns), 1);
  const rs = Math.max(Math.round(rows), 1);
  const out: Matrix[] = [];
  for (let r = 0; r < rs; r++) {
    for (let k = 0; k < cs; k++) {
      if (r === 0 && k === 0) continue;
      if (out.length >= MAX_PATTERN_COPIES) return out;
      out.push({ a: 1, b: 0, c: 0, d: 1, e: k * dx, f: r * dy });
    }
  }
  return out;
}

/** The mirror across the line through `a` and `b`; `null` if they coincide. */
export function mirrorAcross(a: Point, b: Point): Matrix | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (!(l2 > 1e-18)) return null;
  const m00 = (dx * dx - dy * dy) / l2;
  const m01 = (2 * dx * dy) / l2;
  // x' = m00 x + m01 y + e, y' = m01 x − m00 y + f; a stays put
  return {
    a: m00,
    b: m01,
    c: m01,
    d: -m00,
    e: a.x - m00 * a.x - m01 * a.y,
    f: a.y - m01 * a.x + m00 * a.y,
  };
}

/** A matrix as SVG `matrix(…)`, rounded (1e-6) so copies stay readable. */
export function matrixText(m: Matrix): string {
  const r = (v: number) => {
    const x = Math.round(v * 1e6) / 1e6;
    return String(Object.is(x, -0) ? 0 : x);
  };
  return `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(r).join(' ')})`;
}
