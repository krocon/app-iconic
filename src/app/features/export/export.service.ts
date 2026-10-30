import { computed, inject, Injectable, signal } from '@angular/core';
import { ExportApi } from '../../core/export/export-api';
import {
  ExportAppearance,
  ExportProgress,
  ExportReport,
  ExportVariant,
  PackageKind,
  PackageSource,
  PNG_SIZES,
  PngSize,
} from '../../core/export/export.models';
import { AskService } from '../../shared/ask/ask.service';
import { DocumentStore } from '../document/document.store';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { DialogService } from '../../shared/dialog/dialog.service';
import { IconDocument } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import {
  DEFAULT_CHOICE,
  ExportChoice,
  ExportFormat,
  ExportRequest,
  exportRequest,
  exportVariants,
  fileBaseName,
} from './export-options';
import { isPackage, packageKind, packageSources } from './export-packages';
import { exportSvg, RasterSizes } from './export-svg';
import { colorSchemeSvg } from './favicon-svg';
import { groups } from '../document/model/icon-json';
import { groupLabel } from '../hierarchy/node-label';
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
export async function rasterSizes(doc: IconDocument): Promise<RasterSizes> {
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
  /** The tint of the canvas is the default tint of a tinted export (prompt 077 E2). */
  private readonly canvas = inject(CanvasViewStore);
  private readonly ask = inject(AskService);

  readonly choice = signal<ExportChoice>(DEFAULT_CHOICE);
  readonly running = signal(false);
  readonly progress = signal<ExportProgress | null>(null);
  /** The first file of the last finished export – "Show in Folder" (design 030 E6). */
  readonly lastExport = signal<string | null>(null);
  readonly canExport = computed(() => !!this.files.store() && !this.running());
  /** The document's groups for the Android layer choice (prompt 079 E4): index and label. */
  readonly groupChoices = computed(() => {
    const store = this.files.store();
    return store
      ? groups(store.document().iconJson).map((g, index) => ({
          index,
          label: groupLabel(g, index),
        }))
      : [];
  });
  /** Stop pressed before the backend had the job (while the SVGs were built). */
  private stopRequested = false;
  /** The last finished export per document for "Export Again" (prompt 078, session only). */
  private readonly lastRequests = new WeakMap<DocumentStore, ExportRequest>();
  private readonly lastVersion = signal(0);
  /** The window's document has an export to repeat. */
  readonly canExportAgain = computed(() => {
    this.lastVersion();
    const store = this.files.store();
    return !!store && !this.running() && this.lastRequests.has(store);
  });

  openDialog(format: ExportFormat): void {
    this.choice.update((c) => ({ ...c, format, tint: this.canvas.options().tint }));
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
    return exportVariants(req).map(({ appearance, tint }) => ({
      appearance,
      svg: exportSvg(
        doc,
        appearance,
        { mask: req.mask, effects: req.effects, dimensions: req.dimensions, tint },
        raster,
      ),
    }));
  }

  /** The SVG sources of a package (design 078 E1), built from the current document. */
  async packageSources(
    doc: IconDocument,
    kind: PackageKind,
    req: ExportChoice,
  ): Promise<PackageSource[]> {
    const raster = await rasterSizes(doc);
    return packageSources(kind, req, groups(doc.iconJson).length).map((s) => {
      const svg = (appearance: ExportAppearance) =>
        exportSvg(
          doc,
          appearance,
          {
            mask: s.mask,
            frame: s.frame,
            effects: req.effects,
            dimensions: req.dimensions,
            tint: s.tint,
            groups: s.groups,
            fill: s.fill,
            scale: s.scale,
          },
          raster,
        );
      // favicon.svg: light and dark in one file (prompt 079 E6)
      return {
        id: s.id,
        svg: s.colorScheme ? colorSchemeSvg(svg('light'), svg('dark')) : svg(s.appearance),
      };
    });
  }

  private async write(
    doc: IconDocument,
    req: ExportRequest,
    targetDir: string,
  ): Promise<ExportReport | 'stopped'> {
    const options = { baseName: fileBaseName(doc.name, T.untitled), overwrite: req.overwrite };
    const onProgress = (p: ExportProgress) => this.progress.set(p);
    if (isPackage(req.format)) {
      const kind = packageKind(req);
      if (!kind) throw { code: 'invalid_request', message: 'no platform', path: null };
      const sources = await this.packageSources(doc, kind, req);
      if (this.stopRequested) return 'stopped';
      return this.api.exportPackage(kind, sources, targetDir, options, onProgress);
    }
    const variants = await this.variants(doc, req);
    if (this.stopRequested) return 'stopped';
    return req.format === 'svg'
      ? this.api.exportSvg(variants, targetDir, options)
      : this.api.exportPng(variants, req.sizes, targetDir, options, onProgress);
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
      const report = await this.write(store.document(), req, req.targetDir);
      if (report === 'stopped')
        return { kind: 'cancelled', report: { files: [], cancelled: true } };
      if (report.cancelled) return { kind: 'cancelled', report };
      const shown = report.folder ?? report.files[0]?.path;
      if (shown) this.lastExport.set(shown);
      this.lastRequests.set(store, { ...req, overwrite: false });
      this.lastVersion.update((v) => v + 1);
      // only loose PNGs: package exports flatten the App Store icons themselves (design 078 E3)
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
   * `file.exportAgain` (prompt 078): the last export of this document with the same choice, the
   * folder included; existing files (normally the last export's) are replaced after a question.
   */
  async exportAgain(): Promise<ExportOutcome> {
    const store = this.files.store();
    const req = store && this.lastRequests.get(store);
    if (!req) return { kind: 'noDocument' };
    let outcome = await this.export(req);
    if (outcome.kind === 'exists') {
      const answer = await this.ask.ask({
        title: T.againTitle,
        message: T.exists,
        buttons: [
          { id: 'cancel', label: T.cancel },
          { id: 'replace', label: T.replace, primary: true },
        ],
        cancel: 'cancel',
      });
      if (answer === 'replace') outcome = await this.export({ ...req, overwrite: true });
    }
    this.files.notice.set(noticeOf(outcome));
    return outcome;
  }

  /**
   * `file.copyPng` (prompt 078 E7): the icon as the canvas shows it (appearance, mask, effects,
   * tint) rendered by Rust into the system clipboard. `size` one of the export sizes (1024).
   */
  async copyPng(args: { size?: unknown; appearance?: unknown } = {}): Promise<boolean> {
    const store = this.files.store();
    if (!store) {
      this.files.notice.set(T.noDocument);
      return false;
    }
    const size = (args.size ?? 1024) as PngSize;
    const view = this.canvas.options();
    const appearance = (args.appearance ?? view.appearance) as ExportAppearance;
    if (!PNG_SIZES.includes(size)) {
      this.files.notice.set(T.copyFailed(T.badArguments));
      return false;
    }
    try {
      const doc = store.document();
      const svg = exportSvg(
        doc,
        appearance,
        { mask: view.mask, effects: view.effects, tint: view.tint },
        await rasterSizes(doc),
      );
      await this.api.copyPng(svg, size);
      this.files.notice.set(T.copied(size));
      return true;
    } catch (e) {
      this.files.notice.set(T.copyFailed(describeFsError(toFsError(e))));
      return false;
    }
  }

  /**
   * `file.exportSvg` / `file.exportPng` with arguments (AI, design 012 E14): straight to the
   * files; without `targetDir` (and no remembered folder) the folder dialog asks. The result is a
   * notice in the status line.
   */
  async runAction(format: ExportFormat, args: Record<string, unknown>): Promise<ExportOutcome> {
    const base = { ...this.choice(), tint: this.canvas.options().tint };
    const req = exportRequest(format, args, base);
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
