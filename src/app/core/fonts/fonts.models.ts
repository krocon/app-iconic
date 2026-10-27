/**
 * Mirror of the font DTOs of Rust `ai-core::fonts` (prompt 013, design 013 Verträge). Keep both
 * sides in sync by hand; every change on both sides + a test.
 */

export interface FontStyleDto {
  /** "Regular", "Bold Italic" … (from the font's name table). */
  name: string;
  weight: number;
  italic: boolean;
  /** Stable id (PostScript name, design 013 E10) for `text_to_path`. */
  id: string;
}

export interface FontFamilyDto {
  family: string;
  styles: FontStyleDto[];
}

export interface TextPathBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One line of text as path data: origin on the baseline at the left, y down (design 013 E9). */
export interface TextPathDto {
  d: string;
  /** Exact bounds of the outlines; `null` without ink. */
  bbox: TextPathBox | null;
  advance: number;
}

/** Limits of `text_to_path` (Rust `fonts::outline`). */
export const TEXT_PATH_LIMITS = {
  maxChars: 256,
  minSize: 1,
  maxSize: 4096,
  maxLetterSpacing: 1000,
} as const;
