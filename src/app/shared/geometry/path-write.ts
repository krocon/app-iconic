import { implied, PathCmd, PathSeg, withStarts } from './path-data';
import { Point } from './view-transform';

/**
 * Writes path segments (`path-data.ts`, design 007 E8) with rounded numbers (design 011 E8, E10).
 * Rounding happens on the ABSOLUTE points; relative values are the difference of the rounded
 * points, so rounding errors never add up along a path. Two forms:
 *
 * - {@link writeKeepingForm}: every segment keeps its command, relative / absolute form and
 *   implicit repetition – only the numbers change (the formatter, `svg-format.ts`).
 * - {@link writeShortest}: per segment the shorter of absolute and relative, `H`/`V` for
 *   horizontal / vertical lines, `S`/`T` where the reflection fits, repeated letters left out,
 *   no separator before `-` (the optimizer, `path-optimize.ts`).
 *
 * Pure.
 */

/** A number with at most `precision` decimals; `-0` and tiny values become `0`. */
export function formatNumber(n: number, precision: number): string {
  const f = 10 ** precision;
  const r = Math.round(n * f) / f;
  if (r === 0 || Object.is(r, -0)) return '0';
  return String(Number(r.toFixed(precision)));
}

const roundTo = (n: number, precision: number) => Number(formatNumber(n, precision));
const roundPt = (p: Point, precision: number): Point => ({
  x: roundTo(p.x, precision),
  y: roundTo(p.y, precision),
});
const samePt = (a: Point | undefined, b: Point | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y;

/** Segments with all points rounded (S/T keep their implied control consistent). */
export function roundSegments(input: readonly PathSeg[], precision: number): PathSeg[] {
  const segs = withStarts(input).map((s) => ({
    ...s,
    p: roundPt(s.p, precision),
    c1: s.c1 && roundPt(s.c1, precision),
    c2: s.c2 && roundPt(s.c2, precision),
    arc: s.arc && {
      ...s.arc,
      rx: roundTo(s.arc.rx, precision),
      ry: roundTo(s.arc.ry, precision),
      rot: roundTo(s.arc.rot, precision),
    },
  }));
  const out = withStarts(segs);
  // the implied control of S / T follows the rounded neighbours
  out.forEach((s, i) => {
    if (s.cmd === 'S' || s.cmd === 'T') s.c1 = implied(out[i - 1], s);
  });
  return out;
}

/** The numbers of a segment (relative to `seg.start` when `rel`), formatted. */
function numbers(seg: PathSeg, cmd: PathCmd, rel: boolean, precision: number): string[] {
  const o = rel ? seg.start : { x: 0, y: 0 };
  const n = (v: number, origin: number) => formatNumber(v - origin, precision);
  const pt = (p: Point) => [n(p.x, o.x), n(p.y, o.y)];
  switch (cmd) {
    case 'Z':
      return [];
    case 'M':
    case 'L':
    case 'T':
      return pt(seg.p);
    case 'H':
      return [n(seg.p.x, o.x)];
    case 'V':
      return [n(seg.p.y, o.y)];
    case 'C':
      return [...pt(seg.c1!), ...pt(seg.c2!), ...pt(seg.p)];
    case 'S':
      return [...pt(seg.c2!), ...pt(seg.p)];
    case 'Q':
      return [...pt(seg.c1!), ...pt(seg.p)];
    case 'A': {
      const a = seg.arc!;
      return [
        formatNumber(a.rx, precision),
        formatNumber(a.ry, precision),
        formatNumber(a.rot, precision),
        String(a.large),
        String(a.sweep),
        ...pt(seg.p),
      ];
    }
  }
}

const letterOf = (cmd: PathCmd, rel: boolean) => (rel ? cmd.toLowerCase() : cmd);
/** The letter that numbers without a letter continue (after M: L). */
const follower = (l: string) => (l === 'M' ? 'L' : l === 'm' ? 'l' : l);

/** Numbers joined compactly: no separator before `-`. */
function joinCompact(nums: readonly string[]): string {
  let out = '';
  for (const s of nums) out += out && !s.startsWith('-') ? ` ${s}` : s;
  return out;
}

/** Same commands and forms, numbers rounded (formatter, design 011 E8). */
export function writeKeepingForm(input: readonly PathSeg[], precision: number): string {
  const segs = roundSegments(input, precision);
  const parts: string[] = [];
  let last = '';
  segs.forEach((seg) => {
    const letter = letterOf(seg.cmd, seg.rel);
    const nums = numbers(seg, seg.cmd, seg.rel, precision).join(' ');
    const implicit = seg.implicit && follower(last) === letter;
    parts.push(implicit ? nums : `${letter}${nums}`);
    if (!implicit) last = letter;
  });
  return parts.join(' ');
}

/** The command forms a segment can be written in (after rounding). */
function forms(seg: PathSeg, prev: PathSeg | undefined): PathCmd[] {
  switch (seg.cmd) {
    case 'L':
    case 'H':
    case 'V':
      if (seg.p.y === seg.start.y) return ['H', 'L'];
      if (seg.p.x === seg.start.x) return ['V', 'L'];
      return ['L'];
    case 'C':
    case 'S': {
      const reflects =
        !!prev &&
        (prev.cmd === 'C' || prev.cmd === 'S') &&
        samePt(implied(prev, { ...seg, cmd: 'S' }), seg.c1);
      return reflects ? ['S', 'C'] : ['C'];
    }
    case 'Q':
    case 'T': {
      const reflects =
        !!prev &&
        (prev.cmd === 'Q' || prev.cmd === 'T') &&
        samePt(implied(prev, { ...seg, cmd: 'T' }), seg.c1);
      return reflects ? ['T', 'Q'] : ['Q'];
    }
    default:
      return [seg.cmd];
  }
}

/** Shortest text (optimizer, design 011 E10). */
export function writeShortest(input: readonly PathSeg[], precision: number): string {
  const segs = roundSegments(input, precision);
  let out = '';
  let last = '';
  segs.forEach((seg, i) => {
    const prev = segs[i - 1];
    let best: { text: string; letter: string } | null = null;
    // the first form is the most compact command; the others only if text is shorter
    for (const cmd of forms(seg, prev)) {
      for (const rel of [false, true]) {
        if (cmd === 'Z' && rel) continue;
        const letter = letterOf(cmd, rel);
        const body = joinCompact(numbers(seg, cmd, rel, precision));
        // after a moveto the line keeps its letter (readable; the template wrote it, too)
        const omit = cmd !== 'Z' && !/^[Mm]$/.test(last) && follower(last) === letter;
        const text = omit ? (body.startsWith('-') ? body : ` ${body}`) : `${letter}${body}`;
        if (!best || text.length < best.text.length) best = { text, letter };
      }
    }
    out += best!.text;
    last = best!.letter;
  });
  return out;
}

/** Anchors of a path (every segment end except `Z`, M points included). */
export function countPoints(segs: readonly PathSeg[]): number {
  return segs.filter((s) => s.cmd !== 'Z').length;
}
