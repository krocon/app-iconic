import { inject, Injectable } from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { IconFileApi } from '../../core/icon-file/icon-file-api';
import { ImageFileDto } from '../../core/icon-file/icon-file.models';
import { rememberRasterSize } from '../canvas/raster-size';
import { svgDataUrlText } from '../commands/image-size';
import { DocumentStore } from '../document/document.store';
import { IconItem } from '../document/model/selection';
import { parseSvg, serializeAsset } from '../document/svg/node-ids';
import { resolveStyles } from '../document/svg/resolve-styles';
import { sanitizeSvg } from '../document/svg/sanitize-svg';
import { FilesService } from '../files/files.service';
import { imageLayerPlan, LayerImage, rasterAssetOf, replaceImageCommand } from './image-layer';
import { IMAGE_LAYER_TEXTS as T } from './image-layer-texts';
import { RasterConverter } from './raster-converter';

/** What became of a picked file: the image, or why not. */
type Prepared = { image: LayerImage; converted: boolean } | { error: string };

/**
 * "Import Image as Layer…" and "Replace Layer Image…" (prompt 080 E1–E4): the file dialog and
 * `read_image_file` of the backend (limits, magic bytes), JPEG/WebP converted to PNG, then one
 * command each. Root service (one window, one document); one file action at a time
 * (`FilesService.busy`).
 */
@Injectable({ providedIn: 'root' })
export class ImageLayerService {
  private readonly api = inject(IconFileApi);
  private readonly files = inject(FilesService);
  private readonly converter = inject(RasterConverter);

  private get store(): DocumentStore | null {
    return this.files.store();
  }

  canImport(): boolean {
    return !this.files.busy() && !!this.store;
  }

  /** The one selected layer shows a PNG (what "Replace" works on). */
  canReplace(): boolean {
    const s = this.store;
    return !this.files.busy() && !!s && rasterAssetOf(s.document(), this.oneItem(s)) !== null;
  }

  importImageLayer(): Promise<boolean> {
    return this.withFile(T.importFailed, async (file) => {
      const s = this.store;
      if (!s) return false;
      const p = await this.prepare(file);
      if ('error' in p) return this.fail(T.importFailed, p.error);
      const plan = imageLayerPlan(s.document(), p.image, {
        nodes: [...s.selection()],
        items: [...s.items()],
      });
      s.execute(plan.command);
      s.selectItems([plan.item]);
      this.files.notice.set(p.converted ? T.converted(plan.layerName) : T.imported(plan.layerName));
      return true;
    });
  }

  replaceLayerImage(): Promise<boolean> {
    const s = this.store;
    const item = s ? this.oneItem(s) : null;
    const name = s ? rasterAssetOf(s.document(), item) : null;
    if (!s || !name) {
      this.files.notice.set(T.noRasterLayer);
      return Promise.resolve(false);
    }
    return this.withFile(T.replaceFailed, async (file) => {
      const p = await this.prepare(file);
      if ('error' in p) return this.fail(T.replaceFailed, p.error);
      if (p.image.kind !== 'png') return this.fail(T.replaceFailed, T.replaceNeedsRaster);
      const cmd = replaceImageCommand(s.document(), item, p.image);
      if (!cmd) return false;
      s.execute(cmd);
      this.files.notice.set(T.replaced(name));
      return true;
    });
  }

  /** Pick and read a file, one file action at a time. */
  private async withFile(failed: string, f: (file: ImageFileDto) => Promise<boolean>) {
    if (this.files.busy() || !this.store) return false;
    this.files.busy.set(true);
    try {
      const path = await this.api.pickImageFile();
      if (!path) return false;
      return await f(await this.api.readImageFile(path));
    } catch (e) {
      return this.fail(failed, describeFsError(toFsError(e)));
    } finally {
      this.files.busy.set(false);
    }
  }

  /** PNG as it is, JPEG/WebP converted, SVG cleaned like "Import SVG" (E1). */
  async prepare(file: ImageFileDto): Promise<Prepared> {
    if (file.mime === 'image/svg+xml') {
      const text = svgDataUrlText(file.dataUrl);
      const svg = text === null ? null : parseSvg(text);
      if (!svg) return { error: T.invalidSvg };
      sanitizeSvg(svg.root);
      resolveStyles(svg.root);
      return {
        image: { kind: 'svg', name: file.name, markup: serializeAsset(svg) },
        converted: false,
      };
    }
    if (file.mime === 'image/png' && file.width && file.height) {
      rememberRasterSize(file.dataUrl, file.width, file.height);
      return {
        image: { kind: 'png', name: file.name, dataUrl: file.dataUrl, ...size(file) },
        converted: false,
      };
    }
    const png = await this.converter.toPng(file.dataUrl);
    if (!png) return { error: T.notDecodable };
    rememberRasterSize(png.dataUrl, png.width, png.height);
    return { image: { kind: 'png', name: file.name, ...png }, converted: true };
  }

  private oneItem(s: DocumentStore): IconItem | null {
    const items = s.items();
    return items.length === 1 && s.selection().length === 0 ? items[0] : null;
  }

  private fail(what: string, why: string): false {
    this.files.notice.set(`${what} ${why}`);
    return false;
  }
}

function size(f: ImageFileDto): { width: number; height: number } {
  return { width: f.width ?? 0, height: f.height ?? 0 };
}
