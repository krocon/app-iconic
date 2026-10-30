import { ExportApi } from '../app/core/export/export-api';
import {
  ExportFileOptions,
  ExportProgress,
  ExportReport,
  ExportVariant,
  PngSize,
} from '../app/core/export/export.models';
import { FsError } from '../app/core/errors/fs-error';

/** One call of the fake, as the backend would get it. */
export interface FakeExportCall {
  kind: 'svg' | 'png';
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
