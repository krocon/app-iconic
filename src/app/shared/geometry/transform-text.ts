import { fmt } from './align';
import { isTranslation, Matrix, multiply } from './matrix';

/**
 * Changing a `transform` attribute as text (design 007 E7, E11). The browser computes every matrix
 * (`transform.baseVal`, CTMs); here only a change is put in FRONT (move / scale of a selection in
 * the parent's space) or at the END (scale in the node's own space) of the list. A leading /
 * trailing `translate(…)` or `matrix(…)` is folded with the change instead of growing a chain on
 * every nudge; the rest of the list keeps its text. Pure.
 */

const NUM = String.raw`[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?`;
const SEP = String.raw`(?:\s*,\s*|\s+)`;
const LEADING = new RegExp(
  String.raw`^\s*(translate|matrix)\s*\(\s*((?:${NUM}${SEP}?)*)\)\s*,?\s*`,
);
const TRAILING = new RegExp(String.raw`,?\s*(translate|matrix)\s*\(\s*((?:${NUM}${SEP}?)*)\)\s*$`);

function numbers(s: string): number[] {
  return (s.match(new RegExp(NUM, 'g')) ?? []).map(Number);
}

/** `translate(x [y])` or `matrix(a b c d e f)` as matrix; `null` if malformed. */
function itemMatrix(kind: string, args: string): Matrix | null {
  const n = numbers(args);
  if (kind === 'translate' && (n.length === 1 || n.length === 2)) {
    return { a: 1, b: 0, c: 0, d: 1, e: n[0], f: n[1] ?? 0 };
  }
  if (kind === 'matrix' && n.length === 6) {
    const [a, b, c, d, e, f] = n;
    return { a, b, c, d, e, f };
  }
  return null;
}

/** One transform function for `m`: `translate(e f)` if it is a pure translation. */
export function affineText(m: Matrix): string {
  if (isTranslation(m)) return `translate(${fmt(m.e)} ${fmt(m.f)})`;
  return `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(fmt).join(' ')})`;
}

const isIdentity = (m: Matrix) => isTranslation(m) && Math.abs(m.e) < 1e-9 && Math.abs(m.f) < 1e-9;

/** `m · transform` – `m` applies after the existing list (the parent's side). */
export function prependAffine(transform: string | null | undefined, m: Matrix): string {
  const old = (transform ?? '').trim();
  const hit = LEADING.exec(old);
  const lead = hit ? itemMatrix(hit[1], hit[2]) : null;
  if (hit && lead) {
    const rest = old.slice(hit[0].length).trim();
    const merged = multiply(m, lead);
    if (isIdentity(merged)) return rest;
    return rest ? `${affineText(merged)} ${rest}` : affineText(merged);
  }
  if (isIdentity(m)) return old;
  return old ? `${affineText(m)} ${old}` : affineText(m);
}

/** `transform · m` – `m` applies first, in the node's own user space. */
export function appendAffine(transform: string | null | undefined, m: Matrix): string {
  const old = (transform ?? '').trim();
  const hit = TRAILING.exec(old);
  const tail = hit ? itemMatrix(hit[1], hit[2]) : null;
  if (hit && tail) {
    const rest = old.slice(0, hit.index).trim();
    const merged = multiply(tail, m);
    if (isIdentity(merged)) return rest;
    return rest ? `${rest} ${affineText(merged)}` : affineText(merged);
  }
  if (isIdentity(m)) return old;
  return old ? `${old} ${affineText(m)}` : affineText(m);
}

/** One function of a transform list as written (`rotate(30 5 5)` → name, numbers, text range). */
export interface TransformItem {
  name: string;
  args: number[];
  start: number;
  end: number;
}

const ITEM = /([a-zA-Z]+)\s*\(([^)]*)\)/g;

/** The functions of a transform list in order (same order as `transform.baseVal`). */
export function transformItems(text: string | null | undefined): TransformItem[] {
  const out: TransformItem[] = [];
  for (const m of (text ?? '').matchAll(ITEM)) {
    out.push({ name: m[1], args: numbers(m[2]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** The list with new numbers for function `index` (the rest keeps its text). */
export function setItemArgs(text: string, index: number, args: readonly number[]): string {
  const it = transformItems(text)[index];
  if (!it) return text;
  return `${text.slice(0, it.start)}${it.name}(${args.map(fmt).join(' ')})${text.slice(it.end)}`;
}
