import { CompositeCommand, DocCommand, ReplaceNode, SetText } from '../document/commands';
import { IconDocument, NodeRef } from '../document/icon-document';
import { SVG_NS } from '../document/svg/node-ids';

/** Default line height of new lines (prompt 075 E4), in `em` of the text. */
export const LINE_HEIGHT = 1.2;
/** Most lines of one text. */
export const MAX_LINES = 200;

/** A `tspan` that starts a line: it sets `x` or a vertical `dy` (as `<text>` lines are written). */
function startsLine(t: Element): boolean {
  return t.hasAttribute('x') || t.hasAttribute('dy');
}

/**
 * The lines of a `<text>` (prompt 075 E4), pure: plain text is one line (line breaks in it count);
 * with line `tspan`s each is a line. Other children (a `tspan` for a coloured word) belong to the
 * line before them.
 */
export function linesOf(text: Element): string[] {
  const kids = Array.from(text.children);
  if (!kids.length) return (text.textContent ?? '').split('\n');
  const lines: string[] = [];
  for (const node of Array.from(text.childNodes)) {
    if (node instanceof Element && node.localName === 'tspan' && startsLine(node)) {
      lines.push(node.textContent ?? '');
    } else {
      const t = node.textContent ?? '';
      if (!lines.length) lines.push(t);
      else lines[lines.length - 1] += t;
    }
  }
  return lines.length ? lines : [''];
}

/** The line height of a text with line `tspan`s (the `dy` of its second line), else the default. */
export function lineHeightOf(text: Element): string {
  const second = Array.from(text.children).filter(
    (t) => t.localName === 'tspan' && startsLine(t),
  )[1];
  return second?.getAttribute('dy') || `${LINE_HEIGHT}em`;
}

/**
 * `<text>` with `lines` as line `tspan`s (`x` of the text, `dy` = line height, the first line
 * at the text's own position) – the text's attributes stay; markup for `ReplaceNode`.
 */
export function textMarkup(text: Element, lines: readonly string[], lineHeight: string): string {
  const doc = text.ownerDocument;
  const el = doc.createElementNS(SVG_NS, 'text');
  for (const a of Array.from(text.attributes)) {
    if (!a.name.startsWith('data-ai-')) el.setAttributeNS(a.namespaceURI, a.name, a.value);
  }
  const x = (text.getAttribute('x') ?? '0').trim().split(/[\s,]+/)[0] || '0';
  lines.slice(0, MAX_LINES).forEach((line, i) => {
    const t = doc.createElementNS(SVG_NS, 'tspan');
    t.setAttribute('x', x);
    t.setAttribute('dy', i === 0 ? '0' : lineHeight);
    t.textContent = line;
    el.appendChild(t);
  });
  return new XMLSerializer().serializeToString(el);
}

/**
 * The command that gives `<text>` the text `value` (prompt 075 E3/E4): a single line without
 * child elements → `setText` (as before); several lines, or a text that has `tspan`s → the text
 * rebuilt with line `tspan`s (`replaceNode`, attributes kept). `null` if nothing changes or `ref`
 * is no text.
 */
export function textSetCommand(doc: IconDocument, ref: NodeRef, value: string): DocCommand | null {
  const el = doc.node(ref);
  if (!el || el.localName !== 'text') return null;
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  if (lines.join('\n') === linesOf(el).join('\n')) return null;
  if (lines.length === 1 && el.children.length === 0) return new SetText([{ ref, text: lines[0] }]);
  // a step named like typing ("Change Text"), not "Edit SVG Code"
  return new CompositeCommand('changeText', [
    new ReplaceNode(ref, textMarkup(el, lines, lineHeightOf(el))),
  ]);
}

/** Markup of a new `<text>` at (`x`, `y`) – baseline at the point, left aligned. */
export function newTextMarkup(
  x: number,
  y: number,
  value: string,
  attrs: Readonly<Record<string, string>>,
): string {
  const doc = document.implementation.createDocument(SVG_NS, 'svg', null);
  const el = doc.createElementNS(SVG_NS, 'text');
  el.setAttribute('x', String(Math.round(x * 100) / 100));
  el.setAttribute('y', String(Math.round(y * 100) / 100));
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length === 1) {
    el.textContent = lines[0];
    return new XMLSerializer().serializeToString(el);
  }
  return textMarkup(el, lines, `${LINE_HEIGHT}em`);
}
