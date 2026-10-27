import { SVG_NS } from '../document/svg/node-ids';

/**
 * Live check of the "Edit SVG…" text (design 011 E4): the browser parses (`DOMParser`), the
 * position of the first error comes from its message. Chromium and WebKit (libxml2) say "error on
 * line L at column C", Firefox "Line Number L, Column C", jsdom "L:C:". Our own rules on top: an
 * asset is one `<svg>` in the SVG namespace, a node exactly one element. Pure apart from the parse.
 */

export type SourceKind = 'node' | 'asset';

export interface SourceProblem {
  kind: 'syntax' | 'root' | 'count' | 'empty';
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  /** The parser's own words (English, from the engine) – only for syntax errors. */
  detail: string;
}

const NS_DECL = `xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink"`;

const PATTERNS: RegExp[] = [
  /error on line (\d+) at column (\d+):\s*([^\n]*)/i,
  /Line Number (\d+), Column (\d+):/i,
  /^\s*(\d+):(\d+):\s*([^\n]*)/,
];

/** Line / column / message from the text of a `<parsererror>`. */
export function parseErrorPosition(message: string): {
  line: number;
  column: number;
  detail: string;
} {
  for (const re of PATTERNS) {
    const m = re.exec(message);
    if (m) {
      const detail = (m[3] ?? /XML Parsing Error:\s*([^\n]*)/i.exec(message)?.[1] ?? '').trim();
      return { line: Number(m[1]), column: Math.max(1, Number(m[2])), detail };
    }
  }
  return { line: 1, column: 1, detail: message.replace(/\s+/g, ' ').trim().slice(0, 200) };
}

function parse(text: string): { doc: Document; error: Element | null } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  return { doc, error: doc.getElementsByTagNameNS('*', 'parsererror')[0] ?? null };
}

/** Position (1-based) of the first non-space character from `offset`. */
function positionAt(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/** Offset of the second top-level element (the text is well-formed here: tags by depth). */
function secondElementOffset(text: string): number {
  let depth = 0;
  let seen = 0;
  const re =
    /<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!m[2]) continue;
    if (m[1]) {
      depth--;
    } else {
      if (depth === 0 && ++seen === 2) return m.index;
      if (!m[3]) depth++;
    }
  }
  return 0;
}

/** `null` if `text` can be applied; else the first problem. */
export function checkSource(text: string, kind: SourceKind): SourceProblem | null {
  if (!text.trim()) return { kind: 'empty', line: 1, column: 1, detail: '' };
  if (kind === 'asset') {
    const { doc, error } = parse(text);
    if (error) return { kind: 'syntax', ...parseErrorPosition(error.textContent ?? '') };
    const root = doc.documentElement;
    if (root.namespaceURI !== SVG_NS || root.localName !== 'svg') {
      return { kind: 'root', ...positionAt(text, text.search(/<[A-Za-z_]/)), detail: '' };
    }
    return null;
  }
  // a node is a fragment: parsed inside a wrapper on the same first line (columns shift)
  const prefix = `<svg ${NS_DECL}>`;
  const { doc, error } = parse(`${prefix}${text}</svg>`);
  if (error) {
    const p = parseErrorPosition(error.textContent ?? '');
    return {
      kind: 'syntax',
      line: p.line,
      column: p.line === 1 ? Math.max(1, p.column - prefix.length) : p.column,
      detail: p.detail,
    };
  }
  const count = doc.documentElement.children.length;
  if (count !== 1) {
    const at = count === 0 ? 0 : secondElementOffset(text);
    return { kind: 'count', ...positionAt(text, at), detail: '' };
  }
  return null;
}

/** Offset of a 1-based line / column in `text`, clamped to the text. */
export function offsetOf(text: string, line: number, column: number): number {
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const nl = text.indexOf('\n', offset);
    if (nl < 0) return text.length;
    offset = nl + 1;
  }
  const end = text.indexOf('\n', offset);
  const lineEnd = end < 0 ? text.length : end;
  return Math.min(offset + Math.max(0, column - 1), lineEnd);
}
