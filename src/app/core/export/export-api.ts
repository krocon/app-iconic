import { Injectable } from '@angular/core';
import { Channel, isTauri } from '@tauri-apps/api/core';
import { call } from '../backend/call';
import {
  ExportFileOptions,
  ExportProgress,
  ExportReport,
  ExportVariant,
  PackageKind,
  PackageSource,
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
  /**
   * A package (prompt 078: `AppIcon.appiconset`, `.icns`, `.ico`) from SVG sources; progress per
   * file, cancellable. A folder appears complete or not at all.
   */
  abstract exportPackage(
    kind: PackageKind,
    sources: PackageSource[],
    targetDir: string,
    options: ExportFileOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<ExportReport>;
  /** Stops the running PNG/package export of this window after the current file. */
  abstract cancelExport(): Promise<void>;
  /** Renders `svg` in `size` px into the system clipboard (prompt 078, `file.copyPng`). */
  abstract copyPng(svg: string, size: PngSize): Promise<void>;
  /** A mockup scene (prompt 081, its own size in points) rendered at `scale` into the clipboard. */
  abstract copyScenePng(svg: string, scale: number): Promise<void>;
  /**
   * Save dialog (Rust) and the scene rendered at `scale` as PNG; the saved path or `null` when the
   * dialog was cancelled (prompt 081).
   */
  abstract saveScenePng(svg: string, scale: number, suggestedName: string): Promise<string | null>;
  /** Shows a file this app exported in the file manager (design 030 E6). */
  abstract revealExport(path: string): Promise<void>;
  /** The colour of `svg` at a point as `#RRGGBBAA` (resvg, the eyedropper – prompt 074 E3). */
  abstract pickColor(svg: string, x: number, y: number): Promise<string>;
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

  exportPackage(
    kind: PackageKind,
    sources: PackageSource[],
    targetDir: string,
    options: ExportFileOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<ExportReport> {
    if (!isTauri()) return call<ExportReport>('export_package');
    const ch = new Channel<ExportProgress>();
    ch.onmessage = onProgress;
    return call<ExportReport>('export_package', {
      kind,
      sources,
      targetDir,
      options,
      onProgress: ch,
    });
  }

  cancelExport(): Promise<void> {
    return call<void>('cancel_export');
  }

  copyPng(svg: string, size: PngSize): Promise<void> {
    return call<void>('copy_png', { svg, size });
  }

  copyScenePng(svg: string, scale: number): Promise<void> {
    return call<void>('copy_scene_png', { svg, scale });
  }

  saveScenePng(svg: string, scale: number, suggestedName: string): Promise<string | null> {
    return call<string | null>('save_scene_png', { svg, scale, suggestedName });
  }

  revealExport(path: string): Promise<void> {
    return call<void>('reveal_export', { path });
  }

  pickColor(svg: string, x: number, y: number): Promise<string> {
    return call<string>('pick_color', { svg, x, y });
  }
}
