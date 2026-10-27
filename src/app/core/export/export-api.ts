import { Injectable } from '@angular/core';
import { Channel, isTauri } from '@tauri-apps/api/core';
import { call } from '../backend/call';
import {
  ExportFileOptions,
  ExportProgress,
  ExportReport,
  ExportVariant,
  PngSize,
} from './export.models';

/**
 * The export backend (design 012): folder dialog, SVG files, PNG with resvg (progress over a
 * channel, cancellable). Tests and the browser mode use `FakeExportApi`.
 */
@Injectable()
export abstract class ExportApi {
  /** Native folder dialog; `null` = cancelled. */
  abstract pickExportDir(): Promise<string | null>;
  abstract exportSvg(
    variants: ExportVariant[],
    targetDir: string,
    options: ExportFileOptions,
  ): Promise<ExportReport>;
  abstract exportPng(
    variants: ExportVariant[],
    sizes: PngSize[],
    targetDir: string,
    options: ExportFileOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<ExportReport>;
  /** Stops the running PNG export of this window after the current file. */
  abstract cancelExport(): Promise<void>;
  /** Shows a file this app exported in the file manager (design 030 E6). */
  abstract revealExport(path: string): Promise<void>;
}

@Injectable()
export class TauriExportApi extends ExportApi {
  pickExportDir(): Promise<string | null> {
    return call<string | null>('pick_export_dir');
  }

  exportSvg(
    variants: ExportVariant[],
    targetDir: string,
    options: ExportFileOptions,
  ): Promise<ExportReport> {
    return call<ExportReport>('export_svg', { variants, targetDir, options });
  }

  exportPng(
    variants: ExportVariant[],
    sizes: PngSize[],
    targetDir: string,
    options: ExportFileOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<ExportReport> {
    // a channel needs the Tauri runtime; without it `call` reports `backend_unavailable`
    if (!isTauri()) return call<ExportReport>('export_png');
    const ch = new Channel<ExportProgress>();
    ch.onmessage = onProgress;
    return call<ExportReport>('export_png', {
      variants,
      sizes,
      targetDir,
      options,
      onProgress: ch,
    });
  }

  cancelExport(): Promise<void> {
    return call<void>('cancel_export');
  }

  revealExport(path: string): Promise<void> {
    return call<void>('reveal_export', { path });
  }
}
