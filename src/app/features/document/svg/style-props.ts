import { SVG_NS } from './node-ids';

/**
 * Properties in an element's `style` attribute (design 006 E4, 009 E3, 010 E15). Values are read
 * through the browser's CSSOM; removing a declaration works on the text so that everything else
 * in the attribute stays exactly as written (unknown declarations such as `-inkscape-…` included).
 */

/** The value of `prop` in the element's own `style` (not inherited), `null` if none. */
export function styleValue(el: Element, prop: string): string | null {
  const style = (el as Partial<ElementCSSInlineStyle>).style;
  const v = style?.getPropertyValue(prop)?.trim();
  return v ? v : null;
}

/** One declaration of a `style` text: `[start, end)` including its `;`, and its name. */
interface Declaration {
  start: number;
  /** End of the leading comments (kept when the declaration is removed). */
  keep: number;
  end: number;
  name: string;
  /** Ends with a `;` (not the last one without separator). */
  terminated: boolean;
}

/**
 * Splits a declaration list at `;` outside strings, brackets and comments (design 010 E15). Not a
 * CSS parser: only enough to find where a declaration starts and ends and what its name is.
 */
function declarations(text: string): Declaration[] {
  const out: Declaration[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let colon = -1;
  const push = (end: number, terminated: boolean) => {
    const head = text.slice(start, colon < 0 ? end : colon);
    const lead = /^(?:\s*\/\*[\s\S]*?\*\/)*/.exec(head)![0];
    const name =
      colon < 0
        ? ''
        : head
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .trim()
            .toLowerCase();
    out.push({ start, keep: start + lead.length, end, name, terminated });
    start = end;
    colon = -1;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') {
      i++;
    } else if (quote) {
      if (c === quote) quote = null;
    } else if (c === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      i = close < 0 ? text.length : close + 1;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '(' || c === '[' || c === '{') {
      depth++;
    } else if ((c === ')' || c === ']' || c === '}') && depth > 0) {
      depth--;
    } else if (c === ':' && depth === 0 && colon < 0) {
      colon = i;
    } else if (c === ';' && depth === 0) {
      push(i + 1, true);
    }
  }
  if (start < text.length) push(text.length, false);
  return out;
}

/** `text` without the declarations named `props` (case-insensitive); the rest unchanged. */
function removeDeclarations(text: string, props: readonly string[]): string {
  const names = new Set(props.map((p) => p.toLowerCase()));
  const list = declarations(text);
  let out = '';
  let removedLast = false;
  for (const [i, d] of list.entries()) {
    if (names.has(d.name)) {
      out += text.slice(d.start, d.keep);
      removedLast = i === list.length - 1;
      continue;
    }
    out += text.slice(d.start, d.end);
    removedLast = false;
  }
  // the removed last declaration had no `;` – drop the separator it hung on
  if (removedLast && !list.at(-1)!.terminated) out = out.replace(/;\s*$/, '');
  return out;
}

/**
 * The element's `style` without the declarations of `props`; `null` when nothing is left. Only
 * those declarations are removed from the text (design 010 E15). If a shorthand still sets one of
 * them afterwards (`font` for `font-size`), that one goes through the CSSOM – the only case in
 * which the browser rewrites the attribute.
 */
export function styleWithout(el: Element, ...props: string[]): string | null {
  const own = el.getAttribute('style') ?? '';
  let rest = removeDeclarations(own, props);
  const tmp = el.ownerDocument.createElementNS(SVG_NS, 'g') as SVGGElement;
  tmp.setAttribute('style', rest);
  if (props.some((p) => tmp.style.getPropertyValue(p))) {
    for (const p of props) tmp.style.removeProperty(p);
    rest = tmp.style.cssText;
  }
  const trimmed = rest.trim();
  return trimmed && !/^[\s;]*$/.test(trimmed) ? trimmed : null;
}
