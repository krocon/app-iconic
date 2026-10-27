import { Injectable } from '@angular/core';
import { call } from '../backend/call';
import { FontFamilyDto, TextPathDto } from './fonts.models';

/**
 * The fonts of the system (design 013 E8–E11): the list of families and styles, and text to path
 * (shaping and outlines in Rust). Tests and the browser mode use `FakeFontApi`.
 */
@Injectable()
export abstract class FontApi {
  abstract listFonts(): Promise<FontFamilyDto[]>;
  /** Errors: `invalid_text`, `too_large`, `not_found`, `missing_glyphs`. */
  abstract textToPath(
    text: string,
    fontId: string,
    size: number,
    letterSpacing: number,
  ): Promise<TextPathDto>;
}

@Injectable()
export class TauriFontApi extends FontApi {
  listFonts(): Promise<FontFamilyDto[]> {
    return call<FontFamilyDto[]>('list_fonts');
  }

  textToPath(
    text: string,
    fontId: string,
    size: number,
    letterSpacing: number,
  ): Promise<TextPathDto> {
    return call<TextPathDto>('text_to_path', { text, fontId, size, letterSpacing });
  }
}
