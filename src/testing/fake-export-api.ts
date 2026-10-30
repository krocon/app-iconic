import { ExportApi } from '../app/core/export/export-api';
import {
  ExportFileOptions,
  ExportProgress,
  ExportReport,
  ExportVariant,
  PackageKind,
  PackageSource,
  PngSize,
} from '../app/core/export/export.models';
import { FsError } from '../app/core/errors/fs-error';
import { packageFiles } from '../app/features/export/export-packages';

/** One call of the fake, as the backend would get it. */
export interface FakeExportCall {
  kind: 'svg' | 'png' | 'package';
  variants: ExportVariant[];
  sizes: PngSize[];
  targetDir: string;
  options: ExportFileOptions;
}

/**
 * The export backend in memory (design 012): files land in `files` (path → SVG text or
 * `png:<size>`), existing names give `already_exists` like Rust, PNG reports progress per file and
 * can be held (`hold`) to test progress and cancelling. Never part of the production build.
 */
export class FakeExportApi extends ExportApi {
  readonly calls: FakeExportCall[] = [];
  readonly files = new Map<string, string>();
  /** Answers of the next folder dialogs (`null` = cancelled); empty → `fallbackDir`. */
  readonly picks: (string | null)[] = [];
  fallbackDir: string | null = '/export';
  /** PNG files whose pixels are not all opaque (by name), else derived: masked = transparent. */
  transparentNames = new Set<string>();
  /** Set → every PNG file waits for this promise before it is "written". */
  hold: Promise<void> | null = null;
  /** The next call fails with this error. */
  failNext: FsError | null = null;
  private cancelled = false;

  pickExportDir(): Promise<string | null> {
    return Promise.resolve(this.picks.length ? this.picks.shift()! : this.fallbackDir);
  }

  private names(variants: ExportVariant[], sizes: PngSize[] | null, base: string): string[] {
    return variants.flatMap((v) =>
      sizes
        ? sizes.map((s) => `${base}-${v.appearance}-${s}.png`)
        : [`${base}-${v.appearance}.svg`],
    );
  }

  private check(dir: string, names: string[], options: ExportFileOptions): void {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    const taken = names.find((n) => this.files.has(`${dir}/${n}`));
    if (taken && !options.overwrite) {
      throw { code: 'already_exists', message: 'file exists', path: `${dir}/${taken}` } as FsError;
    }
  }

  async exportSvg(
    variants: ExportVariant[],
    targetDir: string,
    options: ExportFileOptions,
  ): Promise<ExportReport> {
    this.calls.push({ kind: 'svg', variants, sizes: [], targetDir, options });
    const names = this.names(variants, null, options.baseName);
    this.check(targetDir, names, options);
    const files = names.map((name, i) => {
      const path = `${targetDir}/${name}`;
      this.files.set(path, variants[i].svg);
      return { name, path, transparent: null };
    });
    return { files, cancelled: false };
  }

  async exportPng(
    variants: ExportVariant[],
    sizes: PngSize[],
    targetDir: string,
    options: ExportFileOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<ExportReport> {
    this.calls.push({ kind: 'png', variants, sizes, targetDir, options });
    const names = this.names(variants, sizes, options.baseName);
    this.check(targetDir, names, options);
    this.cancelled = false;
    const files: ExportReport['files'] = [];
    for (const name of names) {
      if (this.hold) await this.hold;
      if (this.cancelled) return { files, cancelled: true };
      const path = `${targetDir}/${name}`;
      this.files.set(path, `png:${name}`);
      const variant = variants.find((v) => name.includes(`-${v.appearance}-`))!;
      const transparent =
        this.transparentNames.has(name) || variant.svg.includes('clip-path="url(#ai-export-mask)"');
      files.push({ name, path, transparent });
      onProgress({ done: files.length, total: names.length, name });
    }
    return { files, cancelled: false };
  }

  /** Package calls with their kind and sources (prompt 078). */
  readonly packages: { kind: PackageKind; sources: PackageSource[]; targetDir: string }[] = [];

  /**
   * Package export like Rust: names from `packageFiles` (the mirror of the Rust plan), a folder
   * counts as one target (exists → `already_exists`), a cancelled folder leaves nothing.
   */
  async exportPackage(
    kind: PackageKind,
    sources: PackageSource[],
    targetDir: string,
    options: ExportFileOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<ExportReport> {
    this.calls.push({ kind: 'package', variants: [], sizes: [], targetDir, options });
    this.packages.push({ kind, sources, targetDir });
    const plan = packageFiles(kind, options.baseName);
    const targets = plan.folder ? [plan.folder] : plan.files;
    this.check(targetDir, targets, options);
    this.cancelled = false;
    const root = plan.folder ? `${targetDir}/${plan.folder}` : targetDir;
    const files: ExportReport['files'] = [];
    const written: [string, string][] = [];
    for (const name of plan.files) {
      if (this.hold) await this.hold;
      if (this.cancelled) {
        if (plan.folder) return { files: [], cancelled: true, folder: null };
        break;
      }
      const path = `${root}/${name}`;
      written.push([path, `package:${name}`]);
      if (!plan.folder) this.files.set(path, `package:${name}`);
      files.push({ name, path, transparent: name.endsWith('.png') ? false : null });
      onProgress({ done: files.length, total: plan.files.length, name });
    }
    if (this.cancelled) return { files, cancelled: true, folder: null };
    if (plan.folder) {
      this.files.set(root, 'folder');
      for (const [p, v] of written) this.files.set(p, v);
    }
    return { files, cancelled: false, folder: plan.folder ? root : null };
  }

  /** PNGs put into the "clipboard" (prompt 078). */
  readonly clipboard: { svg: string; size: PngSize }[] = [];

  copyPng(svg: string, size: PngSize): Promise<void> {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      return Promise.reject(e);
    }
    this.clipboard.push({ svg, size });
    return Promise.resolve();
  }

  /** Scenes put into the "clipboard" or saved (prompt 081). */
  readonly scenes: { svg: string; scale: number; path: string | null }[] = [];
  /** Answers of the next scene save dialogs (`null` = cancelled); empty → `/export/<name>`. */
  readonly scenePicks: (string | null)[] = [];

  copyScenePng(svg: string, scale: number): Promise<void> {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      return Promise.reject(e);
    }
    this.scenes.push({ svg, scale, path: null });
    return Promise.resolve();
  }

  saveScenePng(svg: string, scale: number, suggestedName: string): Promise<string | null> {
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      return Promise.reject(e);
    }
    const path = this.scenePicks.length ? this.scenePicks.shift()! : `/export/${suggestedName}.png`;
    if (path === null) return Promise.resolve(null);
    this.scenes.push({ svg, scale, path });
    this.files.set(path, `png:scene@${scale}x`);
    return Promise.resolve(path);
  }

  cancelExport(): Promise<void> {
    this.cancelled = true;
    return Promise.resolve();
  }

  /** Paths shown in the "file manager". */
  readonly revealed: string[] = [];

  revealExport(path: string): Promise<void> {
    if (!this.files.has(path)) {
      return Promise.reject({ code: 'not_found', message: 'not exported', path } as FsError);
    }
    this.revealed.push(path);
    return Promise.resolve();
  }

  /** The colour `pickColor` answers (tests set it; default transparent like an empty spot). */
  pickedColor = '#00000000';
  readonly picks2: { x: number; y: number }[] = [];

  pickColor(_svg: string, x: number, y: number): Promise<string> {
    this.picks2.push({ x, y });
    return Promise.resolve(this.pickedColor);
  }
}
