import { FontFamilyDto, FontStyleDto } from '../../core/fonts/fonts.models';
import { resolveFont } from '../tools/text-path';

/** The CSS generic families: they mean the system's default font. */
const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  '-apple-system',
  'blinkmacsystemfont',
]);

/** `"SF Pro", Arial, sans-serif` → the family names without quotes. */
export function familyList(css: string): string[] {
  return css
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

/** The style of `fam` nearest to `weight` with the asked slant. */
export function styleFor(fam: FontFamilyDto, weight: number, italic: boolean): FontStyleDto | null {
  return (
    [...fam.styles].sort(
      (a, b) =>
        Number(a.italic !== italic) - Number(b.italic !== italic) ||
        Math.abs(a.weight - weight) - Math.abs(b.weight - weight),
    )[0] ?? null
  );
}

export interface FontChoice {
  style: FontStyleDto | null;
  /** The first named family when none of the list is installed (a question to the user). */
  missing: string | null;
}

/**
 * The font of a text for its outlines (prompt 075 E5), pure: the first installed family of the
 * computed `font-family` list, its style nearest to the weight and slant; a generic family means
 * the default font. Nothing installed → `missing` names the first one (the user is asked).
 */
export function chooseFont(
  fonts: readonly FontFamilyDto[],
  cssFamily: string,
  weight: number,
  italic: boolean,
): FontChoice {
  const list = familyList(cssFamily);
  for (const name of list) {
    if (GENERIC.has(name.toLowerCase())) {
      const def = resolveFont(fonts);
      const fam = def ? fonts.find((f) => f.styles.includes(def)) : null;
      return { style: fam ? styleFor(fam, weight, italic) : def, missing: null };
    }
    const fam = fonts.find((f) => f.family.toLowerCase() === name.toLowerCase());
    if (fam) return { style: styleFor(fam, weight, italic), missing: null };
  }
  return { style: null, missing: list[0] ?? 'sans-serif' };
}

/** CSS `font-weight` → number (`bold` = 700). */
export function weightOf(css: string): number {
  if (css === 'bold' || css === 'bolder') return 700;
  if (css === 'lighter') return 300;
  const n = Number(css);
  return Number.isFinite(n) ? n : 400;
}

/** Attributes of a text that mean nothing on a path. */
const TEXT_ONLY =
  /^(x|y|dx|dy|rotate|textLength|lengthAdjust|font(-.*)?|text-anchor|letter-spacing|word-spacing|dominant-baseline|alignment-baseline|baseline-shift|writing-mode|direction|unicode-bidi|text-decoration|xml:space)$/;

/** The path that replaces a text: its paint, classes, transform … stay, its text settings go. */
export function pathMarkupFor(text: Element, d: string): string {
  const doc = text.ownerDocument;
  const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  for (const a of Array.from(text.attributes)) {
    if (a.name.startsWith('data-ai-') || TEXT_ONLY.test(a.name)) continue;
    p.setAttributeNS(a.namespaceURI, a.name, a.value);
  }
  p.setAttribute('d', d);
  return new XMLSerializer().serializeToString(p);
}
