import { elementsOf } from './node-ids';

/**
 * Resolves `<style>` rules, classes and `style` attributes of an imported SVG into attributes
 * (design 003 E5) – without an own CSS parser: the browser parses the rules
 * (`CSSStyleSheet.replaceSync`), applies them to a copy in a hidden shadow root (no effect on
 * the app) and `getComputedStyle` tells what they change. Only for **import**; an opened `.icon`
 * is never rewritten. Needs a real browser (jsdom has no cascade): without constructable style
 * sheets only the units are normalised.
 */

/** Properties inherited by children (only these may be skipped when the parent has them). */
const INHERITED = new Set([
  'clip-rule', 'color', 'color-interpolation', 'color-interpolation-filters', 'cursor',
  'direction', 'dominant-baseline', 'fill', 'fill-opacity', 'fill-rule', 'font-family',
  'font-size', 'font-size-adjust', 'font-stretch', 'font-style', 'font-variant', 'font-weight',
  'image-rendering', 'letter-spacing', 'marker-end', 'marker-mid', 'marker-start',
  'paint-order', 'pointer-events', 'shape-rendering', 'stroke', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-opacity', 'stroke-width', 'text-anchor', 'text-rendering', 'visibility',
  'word-spacing', 'writing-mode',
]); // prettier-ignore

/** SVG presentation attributes (written as attributes; everything else goes into `style`). */
const PRESENTATION = new Set([
  ...INHERITED, 'alignment-baseline', 'baseline-shift', 'clip-path', 'display', 'filter',
  'flood-color', 'flood-opacity', 'lighting-color', 'mask', 'opacity', 'overflow',
  'stop-color', 'stop-opacity', 'text-decoration', 'transform', 'unicode-bidi',
  'vector-effect', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height',
]); // prettier-ignore

/** Attributes that are lengths (units normalised, design 003 E5). */
const LENGTHS = new Set([
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'width', 'height',
  'stroke-width', 'stroke-dashoffset', 'font-size', 'dx', 'dy', 'stroke-dasharray',
]); // prettier-ignore

const NUMBER_UNIT = /(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px|em)\b/gi;

function round(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** `12px` → `12`, `2em` → `2 × fontSize`; `%` and plain numbers stay. */
export function normalizeLength(value: string, fontSize: number): string {
  return value.replace(NUMBER_UNIT, (_m, num: string, unit: string) =>
    unit.toLowerCase() === 'px' ? num : round(parseFloat(num) * fontSize),
  );
}

function supported(): boolean {
  try {
    const s = new CSSStyleSheet();
    s.replaceSync('');
    return typeof document !== 'undefined' && 'adoptedStyleSheets' in Document.prototype;
  } catch {
    return false;
  }
}

/** Property names of all style rules (also inside `@media` etc.). */
function ruleProperties(rules: CSSRuleList, out: Set<string>): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      for (const p of Array.from(rule.style)) out.add(p);
    }
    if ('cssRules' in rule) ruleProperties((rule as CSSGroupingRule).cssRules, out);
  }
}

function inlineProperties(el: Element, out: Set<string>): void {
  const style = (el as SVGElement).style;
  if (!style) return;
  for (const p of Array.from(style)) out.add(p);
}

type Values = Map<string, string>[];

function computed(els: Element[], props: string[]): Values {
  return els.map((el) => {
    const cs = getComputedStyle(el);
    return new Map(props.map((p) => [p, cs.getPropertyValue(p)]));
  });
}

/**
 * Rewrites `root` (an SVG of its own document, cleaned) in place. Returns `true` if styles were
 * resolved (`<style>` elements, classes or `style` attributes were present).
 */
export function resolveStyles(root: Element, host: HTMLElement = document.body): boolean {
  const styleEls = elementsOf(root).filter((e) => e.localName === 'style');
  const els = elementsOf(root).filter((e) => !styleEls.some((s) => s === e || s.contains(e)));
  const hasStyles =
    styleEls.length > 0 || els.some((e) => e.hasAttribute('style') || e.hasAttribute('class'));
  if (!hasStyles || !supported()) {
    normalizeUnits(els, () => 16);
    return false;
  }

  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(styleEls.map((s) => s.textContent ?? '').join('\n'));
  } catch {
    // unparsable CSS: nothing to apply from the sheet
  }
  const props = new Set<string>(['font-size']);
  ruleProperties(sheet.cssRules, props);

  const box = host.ownerDocument.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  // `font: medium` = 16px, the default of a stand-alone SVG (for `em`)
  box.style.cssText =
    'position:fixed;left:-100000px;top:0;width:1024px;height:1024px;font:medium serif;';
  const shadow = box.attachShadow({ mode: 'open' });
  shadow.adoptedStyleSheets = [sheet];
  const copy = host.ownerDocument.importNode(root, true);
  for (const s of elementsOf(copy).filter((e) => e.localName === 'style')) s.remove();
  shadow.appendChild(copy);
  host.appendChild(box);
  try {
    const copyEls = elementsOf(copy);
    for (const el of copyEls) inlineProperties(el, props);
    const names = [...props];
    const withStyles = computed(copyEls, names);
    shadow.adoptedStyleSheets = [];
    for (const el of copyEls) el.removeAttribute('style');
    const without = computed(copyEls, names);
    apply(els, copyEls, names, withStyles, without);
    normalizeUnits(els, (i) => parseFloat(withStyles[i].get('font-size') ?? '') || 16);
  } finally {
    box.remove();
  }
  for (const s of styleEls) s.remove();
  for (const el of els) el.removeAttribute('class');
  return true;
}

function apply(
  els: Element[],
  copyEls: Element[],
  props: string[],
  withStyles: Values,
  without: Values,
): void {
  const index = new Map(copyEls.map((e, i) => [e, i]));
  els.forEach((el, i) => {
    const parent = copyEls[i].parentElement;
    const pi = parent ? index.get(parent) : undefined;
    const style: string[] = [];
    for (const p of props) {
      const w = withStyles[i].get(p) ?? '';
      const wo = without[i].get(p) ?? '';
      if (w === wo || w === '') continue;
      // only inherited from the parent (which gets it itself)
      if (
        INHERITED.has(p) &&
        pi !== undefined &&
        withStyles[pi].get(p) === w &&
        without[pi].get(p) === wo
      ) {
        continue;
      }
      if (PRESENTATION.has(p)) el.setAttribute(p, LENGTHS.has(p) ? normalizeLength(w, 16) : w);
      else style.push(`${p}: ${w}`);
    }
    if (style.length) el.setAttribute('style', style.join('; '));
    else el.removeAttribute('style');
  });
}

function normalizeUnits(els: Element[], fontSize: (index: number) => number): void {
  els.forEach((el, i) => {
    for (const name of el.getAttributeNames()) {
      if (!LENGTHS.has(name)) continue;
      const v = el.getAttribute(name) ?? '';
      const n = normalizeLength(v, fontSize(i));
      if (n !== v) el.setAttribute(name, n);
    }
  });
}
