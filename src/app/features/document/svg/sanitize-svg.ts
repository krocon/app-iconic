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
/** Namespaces whose elements never belong in an icon (HTML can run code, MathML can link). */
const FOREIGN_NAMESPACES = new Set([
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1998/Math/MathML',
]);
const ANIMATIONS = new Set(['animate', 'set', 'animatetransform', 'animatemotion', 'discard']);

const JAVASCRIPT = /^\s*(javascript|vbscript)\s*:|[\s"'(=]\s*(javascript|vbscript)\s*:/i;
/** `url(…)` that does not point into the document or to an embedded image. */
const EXTERNAL_URL = /url\s*\(\s*(?!['"]?\s*(#|data:image\/))/i;
/** CSS functions that load by themselves, without `url(` (prompt 031). */
const LOADING_FUNCTIONS = /(^|[^\w-])(-webkit-)?(image-set|src|image)\s*\(/i;
const SAFE_HREF = /^\s*(#|data:image\/)/i;

function removeAll(found: Set<SanitizeKind>, kind: SanitizeKind, els: Element[]): void {
  for (const el of els) {
    el.remove();
    found.add(kind);
  }
}

/** Resolves CSS escapes (`\75 rl(` is `url(`), so the checks see what the browser sees. */
export function unescapeCss(text: string): string {
  if (!text.includes('\\')) return text;
  return text
    .replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?/gi, (_, hex: string) => {
      const n = parseInt(hex, 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd';
    })
    .replace(/\\([^\n])/g, '$1');
}

/** Whether CSS text (a `<style>` element, a `style` attribute) loads or runs something. */
export function unsafeCss(css: string): boolean {
  const t = unescapeCss(css);
  return (
    /@import/i.test(t) ||
    EXTERNAL_URL.test(t) ||
    LOADING_FUNCTIONS.test(t) ||
    /(javascript|vbscript)\s*:|expression\s*\(|behavior\s*:|-moz-binding/i.test(t)
  );
}

/**
 * Why an attribute value is unsafe, or `null` (also for commands that set attributes – an AI or a
 * pasted value must not bring in what the sanitizer removes on import, prompt 031).
 */
export function unsafeAttribute(localName: string, value: string): SanitizeKind | null {
  const name = localName.trim().toLowerCase();
  if (name.startsWith('on')) return 'handler';
  if (JAVASCRIPT.test(value) || JAVASCRIPT.test(unescapeCss(value))) return 'script';
  if (name === 'href' || name === 'src') return SAFE_HREF.test(value) ? null : 'external_ref';
  if (name === 'base') return 'external_ref'; // xml:base changes what relative links mean
  if (unsafeCss(value)) return 'external_ref';
  return null;
}

function cleanAttributes(el: Element, found: Set<SanitizeKind>): void {
  for (const attr of Array.from(el.attributes)) {
    const kind = unsafeAttribute(attr.localName, attr.value);
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
  removeAll(
    found,
    'foreign_object',
    all().filter((e) => FOREIGN_NAMESPACES.has(e.namespaceURI ?? '')),
  );
  // animations that would set a link or a handler (`<set attributeName="href" to="javascript:…">`)
  removeAll(
    found,
    'script',
    named(ANIMATIONS).filter((e) => {
      const target = (e.getAttribute('attributeName') ?? '').trim().toLowerCase();
      return (
        target.startsWith('on') ||
        target.endsWith('href') ||
        target === 'src' ||
        target === 'style' ||
        target.endsWith('base')
      );
    }),
  );
  removeAll(
    found,
    'style',
    named(new Set(['style'])).filter((e) => unsafeCss(e.textContent ?? '')),
  );
  for (const el of [root, ...all()]) cleanAttributes(el, found);
  return [...found];
}
