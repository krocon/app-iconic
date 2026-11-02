import { computed, inject, Injectable, signal } from '@angular/core';
import { ClipboardApi } from '../../core/clipboard/clipboard-api';
import { describeFsError, FsError, toFsError } from '../../core/errors/fs-error';
import { IconFileApi } from '../../core/icon-file/icon-file-api';
import { TraceApi } from '../../core/trace/trace-api';
import { TraceOptions, TraceResult } from '../../core/trace/trace.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { IconItem } from '../document/model/selection';
import { parseSvg, serializeAsset } from '../document/svg/node-ids';
import { resolveStyles } from '../document/svg/resolve-styles';
import { sanitizeSvg } from '../document/svg/sanitize-svg';
import { FilesService } from '../files/files.service';
import { TemplateService } from '../template/template.service';
import { TemplateStore } from '../template/template.store';
import { TraceSource, tracePlan, traceScale } from './trace-plan';
import {
  overridesOf,
  traceOptions,
  TraceOverrides,
  TracePreset,
  TraceSourceKind,
} from './trace-presets';
import { TRACE_TEXTS as T } from './trace-texts';

function unavailable(message: string): FsError {
  return { code: 'unavailable', message };
}

/**
 * "Trace Image" (prompt 087): the image to trace (the selected PNG layer, the template, the
 * clipboard or a file), the options (preset + changes, remembered for the next time), the trace
 * in Rust and the result as a new layer – one undo step. The dialog previews with `trace`; with
 * arguments `run` does it all at once (AI, tests).
 */
@Injectable({ providedIn: 'root' })
export class TraceService {
  private readonly api = inject(TraceApi);
  private readonly files = inject(FilesService);
  private readonly fileApi = inject(IconFileApi);
  private readonly clipboard = inject(ClipboardApi);
  private readonly dialogs = inject(DialogService);
  private readonly template = inject(TemplateService);
  private readonly templates = inject(TemplateStore);

  readonly source = signal<TraceSource | null>(null);
  readonly preset = signal<TracePreset>('shapes');
  readonly overrides = signal<TraceOverrides>({});
  readonly options = computed<TraceOptions | null>(() => {
    const s = this.source();
    return s ? traceOptions(this.preset(), this.overrides(), traceScale(s)) : null;
  });

  private get store(): DocumentStore | null {
    return this.files.store();
  }

  canTrace(): boolean {
    return !this.files.busy() && !!this.store;
  }

  /** Whether a source can be used now (the dialog's source buttons). */
  available(kind: TraceSourceKind): boolean {
    if (kind === 'layer') return this.template.canFromLayer();
    if (kind === 'template') return this.templates.image() !== null;
    return true;
  }

  /** The selected PNG layer, else the template, else a file. */
  bestSource(): TraceSourceKind {
    if (this.available('layer')) return 'layer';
    if (this.available('template')) return 'template';
    return 'file';
  }

  /** Opens the dialog with `kind` (default: the best source). */
  async open(kind?: TraceSourceKind): Promise<boolean> {
    if (!this.canTrace()) return false;
    const src = await this.load(kind ?? this.bestSource());
    if (!src) return false;
    this.source.set(src);
    this.dialogs.show('trace');
    return true;
  }

  /** Another source in the open dialog. */
  async useSource(kind: TraceSourceKind): Promise<boolean> {
    const src = await this.load(kind);
    if (src) this.source.set(src);
    return src !== null;
  }

  choosePreset(p: TracePreset): void {
    this.preset.set(p);
    this.overrides.set({});
  }

  change(o: TraceOverrides): void {
    this.overrides.update((v) => ({ ...v, ...o }));
  }

  trace(source: TraceSource, options: TraceOptions): Promise<TraceResult> {
    return this.api.traceImage(source.image.dataUrl, options);
  }

  /** The result as a new layer (selected); `false` if its markup is no SVG. */
  insert(source: TraceSource, result: TraceResult): boolean {
    const s = this.store;
    const svg = parseSvg(result.svg);
    if (!s || !svg) {
      this.files.notice.set(T.failed);
      return false;
    }
    sanitizeSvg(svg.root);
    resolveStyles(svg.root);
    const plan = tracePlan(s.document(), source, serializeAsset(svg), {
      nodes: [...s.selection()],
      items: [...s.items()],
    });
    s.execute(plan.command);
    s.selectItems([plan.item]);
    this.files.notice.set(T.inserted(plan.layerName, result.stats.elements));
    return true;
  }

  /**
   * `trace.image` with arguments (E15): source (default the best), preset (default `shapes`) and
   * changes – traced and inserted without the dialog. Throws `FsError` (the AI sees the code).
   */
  async run(args: Record<string, unknown>): Promise<boolean> {
    const kind = (args['source'] as TraceSourceKind | undefined) ?? this.bestSource();
    const src = await this.load(kind, true);
    if (!src) throw unavailable(`no image to trace from the ${kind}`);
    const preset = (args['preset'] as TracePreset | undefined) ?? 'shapes';
    const options = traceOptions(preset, overridesOf(args), traceScale(src));
    const result = await this.trace(src, options);
    if (!this.insert(src, result)) throw unavailable('the trace is no SVG');
    return true;
  }

  /** The image of a source; `null` with a notice (or a throw with `strict`). */
  private async load(kind: TraceSourceKind, strict = false): Promise<TraceSource | null> {
    const fail = (why: string): null => {
      if (strict) throw unavailable(why);
      this.files.notice.set(`${T.noImage} ${why}`);
      return null;
    };
    try {
      switch (kind) {
        case 'layer': {
          const image = await this.template.layerImage();
          const item = this.store?.items()[0];
          if (!image || item?.kind !== 'layer') return fail(T.noRasterLayer);
          return { kind, image, layer: item as Extract<IconItem, { kind: 'layer' }> };
        }
        case 'template': {
          const image = this.templates.image();
          return image ? { kind, image } : fail(T.noTemplate);
        }
        case 'clipboard': {
          const dto = await this.clipboard.readImage();
          const image = dto ? await this.template.toTemplate(dto) : null;
          return image ? { kind, image } : fail(T.noClipboardImage);
        }
        case 'file':
          return await this.fromFile(fail);
      }
    } catch (e) {
      if (strict) throw e;
      return fail(describeFsError(toFsError(e)));
    }
  }

  private async fromFile(fail: (why: string) => null): Promise<TraceSource | null> {
    if (this.files.busy()) return null;
    this.files.busy.set(true);
    try {
      const path = await this.fileApi.pickImageFile();
      if (!path) return null;
      const image = await this.template.toTemplate(await this.fileApi.readImageFile(path));
      return image ? { kind: 'file', image } : fail(T.notDecodable);
    } finally {
      this.files.busy.set(false);
    }
  }
}
