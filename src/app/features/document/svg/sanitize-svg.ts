/**
 * Cleans foreign SVG before it reaches the WebView (design 003 E4, CLAUDE.md "fremde Dateien sind
 * feindlich"): no scripts, no event handlers, no `<foreignObject>`, no references outside the
 * document. Only fragment links (`#id`) and embedded images (`data:image/…`) stay. Changes the
 * DOM in place and reports what was removed.
 */

export type SanitizeKind = 'script' | 'handler' | 'foreign_object' | 'external_ref' | 'style';

/** Elements that run code or embed foreign content. */
const SCRIPT_ELEMENTS = new Set(['script', 'iframe', 'embed', 'object', 'handler', 'listener']);
const FOREIGN_ELEMENTS = new Set(['foreignobject']);
const ANIMATIONS = new Set(['animate', 'set', 'animatetransform', 'animatemotion', 'discard']);

const JAVASCRIPT = /^\s*(javascript|vbscript)\s*:|[\s"'(=]\s*(javascript|vbscript)\s*:/i;
/** `url(…)` that does not point into the document or to an embedded image. */
const EXTERNAL_URL = /url\s*\(\s*(?!['"]?\s*(#|data:image\/))/i;
const SAFE_HREF = /^\s*(#|data:image\/)/i;

function removeAll(found: Set<SanitizeKind>, kind: SanitizeKind, els: Element[]): void {
  for (const el of els) {
    el.remove();
    found.add(kind);
  }
}

function cleanAttributes(el: Element, found: Set<SanitizeKind>): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.localName.toLowerCase();
    const value = attr.value;
    let kind: SanitizeKind | null = null;
    if (name.startsWith('on')) kind = 'handler';
    else if (JAVASCRIPT.test(value)) kind = 'script';
    else if (name === 'href' || name === 'src')
      kind = SAFE_HREF.test(value) ? null : 'external_ref';
    else if (EXTERNAL_URL.test(value) || /@import/i.test(value)) kind = 'external_ref';
    if (kind) {
      el.removeAttributeNode(attr);
      found.add(kind);
    }
  }
}

/** Removes everything unsafe below (and including the attributes of) `root`. */
export function sanitizeSvg(root: Element): SanitizeKind[] {
  const found = new Set<SanitizeKind>();
  const all = () => Array.from(root.querySelectorAll('*'));
  const named = (names: Set<string>) => all().filter((e) => names.has(e.localName.toLowerCase()));
  removeAll(found, 'script', named(SCRIPT_ELEMENTS));
  removeAll(found, 'foreign_object', named(FOREIGN_ELEMENTS));
  // animations that would set a link or a handler (`<set attributeName="href" to="javascript:…">`)
  removeAll(
    found,
    'script',
    named(ANIMATIONS).filter((e) => {
      const target = (e.getAttribute('attributeName') ?? '').toLowerCase();
      return target.startsWith('on') || target.endsWith('href');
    }),
  );
  removeAll(
    found,
    'style',
    named(new Set(['style'])).filter((e) => {
      const css = e.textContent ?? '';
      return (
        /@import/i.test(css) ||
        EXTERNAL_URL.test(css) ||
        /javascript\s*:|expression\s*\(/i.test(css)
      );
    }),
  );
  for (const el of [root, ...all()]) cleanAttributes(el, found);
  return [...found];
}
