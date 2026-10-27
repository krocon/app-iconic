import { FontFamilyDto, FontStyleDto, TextPathDto } from '../../core/fonts/fonts.models';
import { Point } from '../../shared/geometry/view-transform';
import { translatePath } from '../../shared/geometry/path-translate';

/**
 * Pure helpers of text to path (design 013 E13/E14): which font a name means, the default font
 * and the path moved onto a centre.
 */

/** Families tried first for the default (the system sans-serif on each OS). */
const PREFERRED = [
  'Helvetica Neue',
  'Helvetica',
  'Arial',
  'Segoe UI',
  'Inter',
  'Noto Sans',
  'DejaVu Sans',
  'Liberation Sans',
  'Cantarell',
  'Ubuntu',
];

const same = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

/** The style nearest to Regular: weight 400, upright. */
export function regularStyle(styles: readonly FontStyleDto[]): FontStyleDto | null {
  return (
    [...styles].sort(
      (a, b) =>
        Number(a.italic) - Number(b.italic) ||
        Math.abs(a.weight - 400) - Math.abs(b.weight - 400) ||
        a.weight - b.weight,
    )[0] ?? null
  );
}

/** The family of a style id. */
export function familyOf(fonts: readonly FontFamilyDto[], id: string): FontFamilyDto | null {
  return fonts.find((f) => f.styles.some((s) => s.id === id)) ?? null;
}

/**
 * `font` = a style id or a family name (without case); `style` = a style name of that family,
 * else the one nearest to Regular. Without `font` the default family. `null` = not installed.
 */
export function resolveFont(
  fonts: readonly FontFamilyDto[],
  font?: string,
  style?: string,
): FontStyleDto | null {
  if (font === undefined) {
    const fam =
      PREFERRED.map((n) => fonts.find((f) => same(f.family, n))).find(Boolean) ?? fonts[0];
    return fam ? regularStyle(fam.styles) : null;
  }
  for (const f of fonts) {
    const byId = f.styles.find((s) => s.id === font);
    if (byId) return byId;
  }
  const fam = fonts.find((f) => same(f.family, font));
  if (!fam) return null;
  if (style !== undefined) return fam.styles.find((s) => same(s.name, style)) ?? null;
  return regularStyle(fam.styles);
}

/** Families whose name contains `q` (without case). */
export function filterFamilies(fonts: readonly FontFamilyDto[], q: string): FontFamilyDto[] {
  const w = q.trim().toLowerCase();
  return w ? fonts.filter((f) => f.family.toLowerCase().includes(w)) : [...fonts];
}

/** The outlines moved so that the middle of their bounds lies on `center`. */
export function centeredPath(result: TextPathDto, center: Point): string | null {
  const b = result.bbox;
  if (!b || !result.d) return null;
  return translatePath(result.d, center.x - (b.x + b.width / 2), center.y - (b.y + b.height / 2));
}
