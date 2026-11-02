import { inject, Injectable } from '@angular/core';
import { ClipboardApi } from '../../core/clipboard/clipboard-api';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { IconFileApi } from '../../core/icon-file/icon-file-api';
import { ImageFileDto } from '../../core/icon-file/icon-file.models';
import { knownRasterSize, loadRasterSize } from '../canvas/raster-size';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { rasterAssetOf } from '../image-layer/image-layer';
import { RasterConverter } from '../image-layer/raster-converter';
import { TemplateImage, TemplateRect } from './template';
import { TEMPLATE_TEXTS as T } from './template-texts';
import { TemplateStore } from './template.store';

/** Largest side of the template image the AI gets (the router fits it further, E14). */
export const AI_TEMPLATE_SIDE = 1024;

/** The template as the AI tool `get_template` hands it over. */
export interface AiTemplate {
  dataUrl: string;
  name: string;
  placement: TemplateRect;
}

/**
 * Sets the template of the canvas (prompt 087 E12): from an image file, the clipboard, the
 * selected PNG layer or – for the AI – a path. Every image becomes a PNG data URL with its size
 * (JPEG, WebP and SVG drawn once by the browser).
 */
@Injectable({ providedIn: 'root' })
export class TemplateService {
  private readonly api = inject(IconFileApi);
  private readonly clipboard = inject(ClipboardApi);
  private readonly files = inject(FilesService);
  private readonly converter = inject(RasterConverter);
  readonly store = inject(TemplateStore);

  private get doc(): DocumentStore | null {
    return this.files.store();
  }

  /** The one selected layer shows a PNG. */
  canFromLayer(): boolean {
    const s = this.doc;
    return !!s && rasterAssetOf(s.document(), this.oneItem(s)) !== null;
  }

  async fromFile(): Promise<boolean> {
    if (this.files.busy()) return false;
    this.files.busy.set(true);
    try {
      const path = await this.api.pickImageFile();
      if (!path) return false;
      return await this.fromDto(await this.api.readImageFile(path));
    } catch (e) {
      return this.fail(describeFsError(toFsError(e)));
    } finally {
      this.files.busy.set(false);
    }
  }

  async fromClipboard(): Promise<boolean> {
    try {
      const img = await this.clipboard.readImage();
      if (!img) return this.fail(T.noClipboardImage);
      return await this.fromDto(img);
    } catch (e) {
      return this.fail(describeFsError(toFsError(e)));
    }
  }

  async fromLayer(): Promise<boolean> {
    const img = await this.layerImage();
    if (!img) return this.fail(T.noRasterLayer);
    this.store.set(img);
    this.files.notice.set(T.set(img.name));
    return true;
  }

  /** The AI's image (prompt 087 E14): an absolute path the router allowed. Throws `FsError`. */
  async fromPath(path: string): Promise<TemplateImage> {
    const img = await this.toTemplate(await this.api.readImageFile(path));
    if (!img) throw { code: 'invalid_image', message: 'the image could not be decoded' };
    this.store.set(img);
    return img;
  }

  /** The template for the AI, at most `AI_TEMPLATE_SIDE` on its longer side; `null` without one. */
  async forAi(): Promise<AiTemplate | null> {
    const img = this.store.image();
    const placement = this.store.placement();
    if (!img || !placement) return null;
    const small =
      Math.max(img.width, img.height) > AI_TEMPLATE_SIDE
        ? await this.converter.toPng(img.dataUrl, AI_TEMPLATE_SIDE)
        : null;
    return { dataUrl: small?.dataUrl ?? img.dataUrl, name: img.name, placement };
  }

  /** The selected PNG layer as an image (also the trace source "layer"). */
  async layerImage(): Promise<TemplateImage | null> {
    const s = this.doc;
    if (!s) return null;
    const name = rasterAssetOf(s.document(), this.oneItem(s));
    const url = name ? s.document().asset(name)?.dataUrl : undefined;
    if (!name || !url) return null;
    const size = knownRasterSize(url) ?? (await loadRasterSize(url));
    return size ? { name, dataUrl: url, width: size.width, height: size.height } : null;
  }

  /** A read image as template image: PNG with a known size as it is, everything else drawn once. */
  async toTemplate(file: ImageFileDto): Promise<TemplateImage | null> {
    if (file.mime === 'image/png' && file.width && file.height) {
      return { name: file.name, dataUrl: file.dataUrl, width: file.width, height: file.height };
    }
    const png = await this.converter.toPng(file.dataUrl);
    return png ? { name: file.name, ...png } : null;
  }

  private async fromDto(file: ImageFileDto): Promise<boolean> {
    const img = await this.toTemplate(file);
    if (!img) return this.fail(T.notDecodable);
    this.store.set(img);
    this.files.notice.set(T.set(img.name));
    return true;
  }

  private oneItem(s: DocumentStore) {
    const items = s.items();
    return items.length === 1 && s.selection().length === 0 ? items[0] : null;
  }

  private fail(why: string): false {
    this.files.notice.set(`${T.failed} ${why}`);
    return false;
  }
}
