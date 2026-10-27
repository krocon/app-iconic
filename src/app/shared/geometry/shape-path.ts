import { fmt } from './align';

/**
 * Basic shapes as path data (design 013 E19), pure: circle, ellipse, rect (with `rx`/`ry` like
 * SVG 2: a missing one takes the other, both clamped to half the side), line, polyline, polygon.
 * `path` passes through. `null` for other tags or unusable values (a zero radius draws nothing).
 */

const num = (v: string | undefined, fallback = 0) => {
  if (v === undefined || v.trim() === '' || v.trim() === 'auto') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

function pointList(v: string | undefined): number[] | null {
  const parts = (v ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length % 2) parts.pop(); // SVG: an odd last number is dropped
  return parts.length >= 4 ? parts : null;
}

/** An ellipse as two arcs (start at the left). */
function ellipse(cx: number, cy: number, rx: number, ry: number): string | null {
  if (!(rx > 0) || !(ry > 0) || ![cx, cy].every(Number.isFinite)) return null;
  const f = fmt;
  return (
    `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}` +
    `A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`
  );
}

export function shapeToPath(tag: string, a: Record<string, string>): string | null {
  const f = fmt;
  switch (tag) {
    case 'path':
      return a['d']?.trim() ? a['d'] : null;
    case 'circle':
      return ellipse(num(a['cx']), num(a['cy']), num(a['r']), num(a['r']));
    case 'ellipse':
      return ellipse(num(a['cx']), num(a['cy']), num(a['rx']), num(a['ry']));
    case 'rect': {
      const x = num(a['x']);
      const y = num(a['y']);
      const w = num(a['width']);
      const h = num(a['height']);
      if (!(w > 0) || !(h > 0) || ![x, y].every(Number.isFinite)) return null;
      let rx = num(a['rx'], NaN);
      let ry = num(a['ry'], NaN);
      if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
      if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(Math.max(rx, 0), w / 2);
      ry = Math.min(Math.max(ry, 0), h / 2);
      if (rx === 0 || ry === 0) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
      const arc = (ex: number, ey: number) => `A${f(rx)} ${f(ry)} 0 0 1 ${f(ex)} ${f(ey)}`;
      return (
        `M${f(x + rx)} ${f(y)}H${f(x + w - rx)}${arc(x + w, y + ry)}V${f(y + h - ry)}` +
        `${arc(x + w - rx, y + h)}H${f(x + rx)}${arc(x, y + h - ry)}V${f(y + ry)}${arc(x + rx, y)}Z`
      );
    }
    case 'line': {
      const v = [num(a['x1']), num(a['y1']), num(a['x2']), num(a['y2'])];
      return v.every(Number.isFinite) ? `M${f(v[0])} ${f(v[1])}L${f(v[2])} ${f(v[3])}` : null;
    }
    case 'polyline':
    case 'polygon': {
      const p = pointList(a['points']);
      if (!p) return null;
      let d = `M${f(p[0])} ${f(p[1])}`;
      for (let i = 2; i < p.length; i += 2) d += `L${f(p[i])} ${f(p[i + 1])}`;
      return tag === 'polygon' ? d + 'Z' : d;
    }
    default:
      return null;
  }
}
