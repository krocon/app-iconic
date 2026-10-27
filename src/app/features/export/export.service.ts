import { computed, inject, Injectable, signal } from '@angular/core';
import { ExportApi } from '../../core/export/export-api';
import { ExportProgress, ExportReport, ExportVariant } from '../../core/export/export.models';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { DialogService } from '../../shared/dialog/dialog.service';
import { IconDocument } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import {
  DEFAULT_CHOICE,
  ExportChoice,
  ExportFormat,
  ExportRequest,
  exportRequest,
  fileBaseName,
} from './export-options';
import { exportSvg, RasterSizes } from './export-svg';
import { EXPORT_TEXTS as T } from './export-texts';

export type ExportOutcome =
  | { kind: 'done'; report: ExportReport; transparentWarning: boolean }
  | { kind: 'cancelled'; report: ExportReport }
  /** A target exists and `overwrite` was not set – nothing was written (design 012 E11). */
  | { kind: 'exists' }
  | { kind: 'error'; message: string }
  | { kind: 'noTarget' }
  | { kind: 'noDocument' };

/** Natural sizes of the raster assets (design 012 E7); unknown ones are left out. */
async function rasterSizes(doc: IconDocument): Promise<RasterSizes> {
  const out = new Map<string, { width: number; height: number }>();
  for (const a of doc.assets.values()) {
    if (a.svg || !a.dataUrl) continue;
    try {
      const img = new Image();
      img.src = a.dataUrl;
      await img.decode();
      if (img.naturalWidth > 0)
        out.set(a.name, { width: img.naturalWidth, height: img.naturalHeight });
    } catch {
      // not decodable here (or no layout engine) – full canvas, like the canvas before decoding
    }
  }
  return out;
}

/**
 * Export of the window's document (design 012): builds the SVG per appearance in the frontend,
 * writes SVG files or PNGs through `ExportApi`, remembers the last choice for the session (E15),
 * progress and cancel (E12), the Apple transparency hint (E13). Dialog and actions use it.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly api = inject(ExportApi);
  private readonly files = inject(FilesService);
  private readonly dialogs = inject(DialogService);

  readonly choice = signal<ExportChoice>(DEFAULT_CHOICE);
  readonly running = signal(false);
  readonly progress = signal<ExportProgress | null>(null);
  /** The first file of the last finished export – "Show in Folder" (design 030 E6). */
  readonly lastExport = signal<string | null>(null);
  readonly canExport = computed(() => !!this.files.store() && !this.running());
  /** Stop pressed before the backend had the job (while the SVGs were built). */
  private stopRequested = false;

  openDialog(format: ExportFormat): void {
    this.choice.update((c) => ({ ...c, format }));
    this.dialogs.show('export');
  }

  update(change: Partial<ExportChoice>): void {
    this.choice.update((c) => ({ ...c, ...change }));
  }

  /** Folder dialog; the choice keeps the folder. `null` = cancelled or failed. */
  async chooseDir(): Promise<string | null> {
    try {
      const dir = await this.api.pickExportDir();
      if (dir) this.update({ targetDir: dir });
      return dir;
    } catch {
      return null;
    }
  }

  /** Builds the SVG of every chosen appearance from the current document. */
  async variants(doc: IconDocument, req: ExportChoice): Promise<ExportVariant[]> {
    const raster = await rasterSizes(doc);
    const opts = { mask: req.mask, effects: req.effects };
    return req.appearances.map((appearance) => ({
      appearance,
      svg: exportSvg(doc, appearance, opts, raster),
    }));
  }

  async export(req: ExportRequest): Promise<ExportOutcome> {
    const store = this.files.store();
    if (!store) return { kind: 'noDocument' };
    if (!req.targetDir) return { kind: 'noTarget' };
    if (this.running()) return { kind: 'error', message: T.busy };
    this.running.set(true);
    this.progress.set(null);
    this.stopRequested = false;
    try {
      const doc = store.document();
      const variants = await this.variants(doc, req);
      if (this.stopRequested) return { kind: 'cancelled', report: { files: [], cancelled: true } };
      const options = { baseName: fileBaseName(doc.name, T.untitled), overwrite: req.overwrite };
      const report =
        req.format === 'svg'
          ? await this.api.exportSvg(variants, req.targetDir, options)
          : await this.api.exportPng(variants, req.sizes, req.targetDir, options, (p) =>
              this.progress.set(p),
            );
      if (report.cancelled) return { kind: 'cancelled', report };
      if (report.files.length) this.lastExport.set(report.files[0].path);
      const transparentWarning =
        req.format === 'png' && req.mask === 'none' && report.files.some((f) => f.transparent);
      return { kind: 'done', report, transparentWarning };
    } catch (e) {
      const err = toFsError(e);
      return err.code === 'already_exists'
        ? { kind: 'exists' }
        : { kind: 'error', message: T.failed(describeFsError(err)) };
    } finally {
      this.running.set(false);
    }
  }

  /** Shows the last exported file in the file manager (`file.revealExport`). */
  async reveal(): Promise<boolean> {
    const path = this.lastExport();
    if (!path) return false;
    try {
      await this.api.revealExport(path);
      return true;
    } catch (e) {
      this.files.notice.set(T.revealFailed(describeFsError(toFsError(e))));
      return false;
    }
  }

  cancel(): void {
    if (!this.running()) return;
    this.stopRequested = true;
    void this.api.cancelExport().catch(() => undefined);
  }

  /**
   * `file.exportSvg` / `file.exportPng` with arguments (AI, design 012 E14): straight to the
   * files; without `targetDir` (and no remembered folder) the folder dialog asks. The result is a
   * notice in the status line.
   */
  async runAction(format: ExportFormat, args: Record<string, unknown>): Promise<ExportOutcome> {
    const req = exportRequest(format, args, this.choice());
    if (!req) {
      this.files.notice.set(T.failed(T.badArguments));
      return { kind: 'error', message: T.badArguments };
    }
    if (!req.targetDir) req.targetDir = await this.chooseDir();
    const outcome = await this.export(req);
    this.files.notice.set(noticeOf(outcome));
    return outcome;
  }
}

/** The status-line text of an outcome. */
export function noticeOf(o: ExportOutcome): string | null {
  switch (o.kind) {
    case 'done':
      return (
        T.done(o.report.files.length) + (o.transparentWarning ? ` ${T.transparentWarning}` : '')
      );
    case 'cancelled':
      return T.cancelled(o.report.files.length);
    case 'exists':
      return T.exists;
    case 'error':
      return o.message;
    case 'noTarget':
      return null;
    case 'noDocument':
      return T.noDocument;
  }
}
