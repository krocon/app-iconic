import { inject, Injectable, signal } from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { FontApi } from '../../core/fonts/font-api';
import { FontFamilyDto, TextPathDto } from '../../core/fonts/fonts.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { AddService } from '../commands/add.service';
import { BLACK, buildElement } from '../commands/element-defaults';
import { FilesService } from '../files/files.service';
import { centeredPath, resolveFont } from './text-path';
import { TOOLS_TEXTS } from './tools-texts';

const T = TOOLS_TEXTS.textPath;

/** Default size of the text (em in document units). */
export const TEXT_PATH_SIZE = 256;

export interface TextPathChoice {
  text: string;
  fontId: string | null;
  size: number;
  letterSpacing: number;
}

/**
 * Text to path (design 013 E13/E14): the font list (once per window, from Rust), the outlines of
 * a line of text, the last choice of the session, and the insertion as one `<path>` filled black,
 * centred – one undo step "Add Text Path".
 */
@Injectable({ providedIn: 'root' })
export class TextPathService {
  private readonly api = inject(FontApi);
  private readonly add = inject(AddService);
  private readonly files = inject(FilesService);
  private readonly dialogs = inject(DialogService);
  readonly fonts = signal<FontFamilyDto[] | null>(null);
  readonly fontsFailed = signal(false);
  /** Last choice of the session (persistent with prompt 015). */
  readonly last = signal<TextPathChoice>({
    text: '',
    fontId: null,
    size: TEXT_PATH_SIZE,
    letterSpacing: 0,
  });
  private loading: Promise<FontFamilyDto[]> | null = null;

  /** The installed fonts; loaded once (Rust scans them in the background at start). */
  loadFonts(): Promise<FontFamilyDto[]> {
    this.loading ??= this.api.listFonts().then(
      (f) => {
        this.fonts.set(f);
        this.fontsFailed.set(false);
        return f;
      },
      () => {
        this.loading = null;
        this.fontsFailed.set(true);
        this.fonts.set([]);
        return [];
      },
    );
    return this.loading;
  }

  textToPath(
    text: string,
    fontId: string,
    size: number,
    letterSpacing: number,
  ): Promise<TextPathDto> {
    return this.api.textToPath(text, fontId, size, letterSpacing);
  }

  openDialog(): void {
    this.dialogs.show('textPath');
  }

  /** `add.textToPath { text, font?, style?, size?, letterSpacing?, fill?, x?, y?, parent?, index? }`. */
  async addFromArgs(args: Record<string, unknown>): Promise<boolean> {
    const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : undefined);
    const num = (k: string) => (typeof args[k] === 'number' ? (args[k] as number) : undefined);
    const fonts = await this.loadFonts();
    const style = resolveFont(fonts, str('font'), str('style'));
    if (!style) {
      this.files.notice.set(T.unknownFont);
      return false;
    }
    const size = num('size') ?? TEXT_PATH_SIZE;
    let result: TextPathDto;
    try {
      result = await this.api.textToPath(
        str('text') ?? '',
        style.id,
        size,
        num('letterSpacing') ?? 0,
      );
    } catch (e) {
      this.files.notice.set(`${T.failed} ${describeFsError(toFsError(e))}`);
      return false;
    }
    return this.insert(result, { fill: str('fill'), x: num('x'), y: num('y'), args });
  }

  /** Inserts the outlines centred on the visible centre (or on `x`/`y`). */
  insert(
    result: TextPathDto,
    o: { fill?: string; x?: number; y?: number; args?: Record<string, unknown> },
  ): Promise<boolean> {
    const place = Object.fromEntries(
      (['parent', 'index'] as const).flatMap((k) =>
        o.args?.[k] !== undefined ? [[k, o.args[k]]] : [],
      ),
    );
    return this.add.insertBuilt('addTextPath', place, (c) => {
      const d = centeredPath(result, { x: o.x ?? c.x, y: o.y ?? c.y });
      return d ? [buildElement({ tag: 'path', attrs: { d, fill: o.fill ?? BLACK } })] : null;
    });
  }
}
