import { Injectable } from '@angular/core';
import { call } from '../backend/call';
import {
  IconDocumentDto,
  IconFormat,
  SaveIconRequest,
  SaveResult,
  SvgFile,
} from './icon-file.models';

/** Typed facade of the `.icon` commands (prompt 002). Tests use `FakeIconFileApi`. */
export abstract class IconFileApi {
  /** Opens a bundle folder or ZIP; the backend keeps it as the session of `path`. */
  abstract openIcon(path: string): Promise<IconDocumentDto>;
  /** A new document (one group, one layer, an empty SVG) without a path. */
  abstract newIcon(): Promise<IconDocumentDto>;
  abstract saveIcon(request: SaveIconRequest): Promise<SaveResult>;
  /** Forgets the session of a closed document. */
  abstract closeIcon(path: string): Promise<void>;
  abstract readSvgFile(path: string): Promise<SvgFile>;
  /** `folder`: pick a bundle folder (Linux/Windows cannot pick folders as files). */
  abstract pickOpenIcon(folder: boolean): Promise<string | null>;
  abstract pickSaveIcon(suggestedName: string, format: IconFormat): Promise<string | null>;
  abstract pickSvgFile(): Promise<string | null>;
}

@Injectable()
export class TauriIconFileApi extends IconFileApi {
  /** The bridge (`call.ts`); a test replaces it to check the argument names. */
  protected backend: typeof call = call;

  openIcon(path: string): Promise<IconDocumentDto> {
    return this.backend<IconDocumentDto>('open_icon', { path });
  }

  newIcon(): Promise<IconDocumentDto> {
    return this.backend<IconDocumentDto>('new_icon');
  }

  saveIcon(r: SaveIconRequest): Promise<SaveResult> {
    return this.backend<SaveResult>('save_icon', {
      path: r.path,
      format: r.format,
      iconJson: r.iconJson,
      assets: r.assets,
      from: r.from ?? null,
    });
  }

  closeIcon(path: string): Promise<void> {
    return this.backend<void>('close_icon', { path });
  }

  readSvgFile(path: string): Promise<SvgFile> {
    return this.backend<SvgFile>('read_svg_file', { path });
  }

  pickOpenIcon(folder: boolean): Promise<string | null> {
    return this.backend<string | null>('pick_open_icon', { folder });
  }

  pickSaveIcon(suggestedName: string, format: IconFormat): Promise<string | null> {
    return this.backend<string | null>('pick_save_icon', { suggestedName, format });
  }

  pickSvgFile(): Promise<string | null> {
    return this.backend<string | null>('pick_svg_file');
  }
}
