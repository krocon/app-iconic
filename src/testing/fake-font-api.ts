import { FontApi } from '../app/core/fonts/font-api';
import { FontFamilyDto, TEXT_PATH_LIMITS, TextPathDto } from '../app/core/fonts/fonts.models';
import { FsError } from '../app/core/errors/fs-error';

const fail = (code: FsError['code'], message: string): Promise<never> =>
  Promise.reject({ code, message, path: null } satisfies FsError);

/** Two families like a small system (Regular/Bold/Italic). */
export const FAKE_FONTS: FontFamilyDto[] = [
  {
    family: 'Fake Sans',
    styles: [
      { name: 'Regular', weight: 400, italic: false, id: 'FakeSans-Regular' },
      { name: 'Italic', weight: 400, italic: true, id: 'FakeSans-Italic' },
      { name: 'Bold', weight: 700, italic: false, id: 'FakeSans-Bold' },
    ],
  },
  {
    family: 'Fake Serif',
    styles: [{ name: 'Regular', weight: 400, italic: false, id: 'FakeSerif-Regular' }],
  },
];

/**
 * Fonts in memory (design 013): every character a box of 0.6 × 0.7 em on the baseline (space
 * 0.3 em), characters outside the Basic Multilingual Plane (emoji) have no glyph – the same error
 * codes as Rust. Never part of the production build.
 */
export class FakeFontApi extends FontApi {
  families: FontFamilyDto[] = FAKE_FONTS;
  readonly calls: { text: string; fontId: string; size: number; letterSpacing: number }[] = [];
  listCalls = 0;

  listFonts(): Promise<FontFamilyDto[]> {
    this.listCalls++;
    return Promise.resolve(structuredClone(this.families));
  }

  textToPath(
    text: string,
    fontId: string,
    size: number,
    letterSpacing: number,
  ): Promise<TextPathDto> {
    this.calls.push({ text, fontId, size, letterSpacing });
    const L = TEXT_PATH_LIMITS;
    if ([...text].length > L.maxChars) return fail('too_large', 'too long');
    if (!text.trim() || /[\u0000-\u001f]/.test(text)) return fail('invalid_text', 'empty');
    if (!(size >= L.minSize && size <= L.maxSize)) return fail('invalid_text', 'size');
    if (!this.families.some((f) => f.styles.some((s) => s.id === fontId))) {
      return fail('not_found', fontId);
    }
    if ([...text].some((c) => c.codePointAt(0)! > 0xffff)) return fail('missing_glyphs', 'emoji');
    let x = 0;
    let d = '';
    let min = Infinity;
    let max = -Infinity;
    const h = 0.7 * size;
    const r = (v: number) => String(Math.round(v * 100) / 100);
    const chars = [...text];
    chars.forEach((c, i) => {
      const w = c === ' ' ? 0.3 * size : 0.6 * size;
      if (c !== ' ') {
        const right = x + w * 0.9;
        d += `M${r(x)} ${r(-h)}L${r(right)} ${r(-h)}L${r(right)} 0L${r(x)} 0Z`;
        min = Math.min(min, x);
        max = Math.max(max, right);
      }
      x += w + (i + 1 < chars.length ? letterSpacing : 0);
    });
    const bbox = max >= min ? { x: min, y: -h, width: max - min, height: h } : null;
    return Promise.resolve({ d, bbox, advance: x });
  }
}
