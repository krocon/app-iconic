import { parsePath } from '../../../shared/geometry/path-data';
import { formatNumber, writeKeepingForm } from '../../../shared/geometry/path-write';
import { serializeElement, SVG_NS } from './node-ids';

/**
 * The SVG formatter (design 011 E8): XML in, readable text out – indent 2, one element per line,
 * attributes in a stable order (namespace declarations, `id`, geometry, `transform`, the rest
 * alphabetically), numbers rounded where attributes carry numbers (`d` through the path
 * tokenizer, design 007 E8). Text content, CDATA and comments stay character for character;
 * elements with text (mixed content) or `xml:space="preserve"` are not broken into lines.
 * Idempotent: formatting the result again gives the same text. The browser parses (`DOMParser`) –
 * no own XML parser. Used by "Copy XML" (006) and the "Format" button of "Edit SVG…"; never when
 * saving (roundtrip, design 003 E3). Pure apart from the parse.
 */

export const DEFAULT_FORMAT_PRECISION = 3;

export interface FormatOptions {
  /** Decimals of numbers; `null` leaves numbers as they are. Default 3. */
  precision?: number | null;
  /** Spaces per level, default 2. */
  indent?: number;
}

/** Geometry first, in this order (design 011 E8). */
const GEOMETRY = [
  'x',
  'y',
  'width',
  'height',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'd',
  'viewBox',
  'preserveAspectRatio',
];
const RANK = new Map<string, number>([
  ['id', 0],
  ...GEOMETRY.map((n, i): [string, number] => [n, i + 1]),
  ['transform', GEOMETRY.length + 1],
]);

/** Attributes whose numbers are rounded (everything else keeps its text). */
export const NUMERIC_ATTRS = new Set([
  ...GEOMETRY.filter((n) => n !== 'd' && n !== 'preserveAspectRatio'),
  'transform',
  'gradientTransform',
  'patternTransform',
  'fx',
  'fy',
  'fr',
  'dx',
  'dy',
  'offset',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'stop-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'font-size',
  'letter-spacing',
  'word-spacing',
  'stdDeviation',
  'refX',
  'refY',
  'markerWidth',
  'markerHeight',
  'textLength',
  'startOffset',
]);

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

/** Every number in an attribute value rounded (units and separators stay). */
export function roundNumbers(value: string, precision: number): string {
  return value.replace(NUMBER, (m) => formatNumber(Number(m), precision));
}

/** Path data with rounded numbers, commands and their form kept; invalid data unchanged. */
export function formatPathData(d: string, precision: number): string {
  const segs = parsePath(d);
  return segs ? writeKeepingForm(segs, precision) : d;
}

function attrRank(name: string): [number, string] {
  if (name === 'xmlns') return [-2, ''];
  if (name.startsWith('xmlns:')) return [-1, name];
  return [RANK.get(name) ?? 1000, name];
}

function compareAttrs(a: Attr, b: Attr): number {
  const [ra, na] = attrRank(a.name);
  const [rb, nb] = attrRank(b.name);
  return ra - rb || (na < nb ? -1 : na > nb ? 1 : 0);
}

const escapeAttr = (v: string) =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
const escapeText = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class Printer {
  private readonly lines: string[] = [];

  constructor(
    private readonly precision: number | null,
    private readonly unit: string,
  ) {}

  text(): string {
    return this.lines.join('\n');
  }

  line(depth: number, s: string): void {
    this.lines.push(this.unit.repeat(depth) + s);
  }

  attrValue(attr: Attr): string {
    const p = this.precision;
    if (p === null) return attr.value;
    if (attr.name === 'd') return formatPathData(attr.value, p);
    if (NUMERIC_ATTRS.has(attr.name)) return roundNumbers(attr.value, p);
    return attr.value;
  }

  openTag(el: Element): string {
    const attrs = Array.from(el.attributes).sort(compareAttrs);
    const text = attrs.map((a) => ` ${a.name}="${escapeAttr(this.attrValue(a))}"`).join('');
    return `<${el.nodeName}${text}`;
  }

  /** An element and its content on one line (mixed content keeps every character). */
  inline(node: Node): string {
    switch (node.nodeType) {
      case Node.TEXT_NODE:
        return escapeText((node as Text).data);
      case Node.CDATA_SECTION_NODE:
        return `<![CDATA[${(node as CDATASection).data}]]>`;
      case Node.COMMENT_NODE:
        return `<!--${(node as Comment).data}-->`;
      case Node.ELEMENT_NODE: {
        const el = node as Element;
        const kids = Array.from(el.childNodes);
        if (!kids.length) return `${this.openTag(el)}/>`;
        return `${this.openTag(el)}>${kids.map((k) => this.inline(k)).join('')}</${el.nodeName}>`;
      }
      default:
        return new XMLSerializer().serializeToString(node);
    }
  }

  element(el: Element, depth: number, preserve: boolean): void {
    const keep = preserve || el.getAttribute('xml:space') === 'preserve';
    const kids = Array.from(el.childNodes);
    const hasText = kids.some(
      (k) =>
        k.nodeType === Node.CDATA_SECTION_NODE ||
        (k.nodeType === Node.TEXT_NODE && /\S/.test((k as Text).data)),
    );
    if (keep || hasText) {
      this.line(depth, this.inline(el));
      return;
    }
    const content = kids.filter((k) => k.nodeType !== Node.TEXT_NODE);
    if (!content.length) {
      this.line(depth, `${this.openTag(el)}/>`);
      return;
    }
    this.line(depth, `${this.openTag(el)}>`);
    for (const k of content) this.node(k, depth + 1, keep);
    this.line(depth, `</${el.nodeName}>`);
  }

  node(node: Node, depth: number, preserve: boolean): void {
    if (node.nodeType === Node.ELEMENT_NODE) this.element(node as Element, depth, preserve);
    else if (node.nodeType !== Node.TEXT_NODE) this.line(depth, this.inline(node));
  }
}

/** Formats SVG (or any XML) markup; `null` if it is not well-formed. */
export function formatSvg(markup: string, opts: FormatOptions = {}): string | null {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (!doc.documentElement || doc.getElementsByTagNameNS('*', 'parsererror').length) return null;
  const precision = opts.precision === undefined ? DEFAULT_FORMAT_PRECISION : opts.precision;
  const p = new Printer(precision, ' '.repeat(opts.indent ?? 2));
  const decl = /^\uFEFF?\s*(<\?xml[\s\S]*?\?>)/.exec(markup)?.[1];
  if (decl) p.line(0, decl);
  for (const n of Array.from(doc.childNodes)) p.node(n, 0, false);
  return p.text() + '\n';
}

/** One element of a document (without internal attributes) formatted. */
export function formatElement(el: Element, opts: FormatOptions = {}): string {
  const markup = serializeElement(el);
  return formatSvg(markup, opts) ?? markup;
}

/**
 * Formats a fragment (the text of one node in "Edit SVG…"): parsed inside an `<svg>` that declares
 * the SVG and xlink namespaces, like `parseFragment`; `null` if it is not well-formed.
 */
export function formatFragment(markup: string, opts: FormatOptions = {}): string | null {
  const unit = ' '.repeat(opts.indent ?? 2);
  const wrapped = `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink">${markup}</svg>`;
  const out = formatSvg(wrapped, opts);
  if (out === null) return null;
  const lines = out.replace(/\n$/, '').split('\n');
  // `<svg …/>` alone: an empty fragment
  if (lines.length < 3) return '';
  return lines
    .slice(1, -1)
    .map((l) => (l.startsWith(unit) ? l.slice(unit.length) : l))
    .join('\n');
}
