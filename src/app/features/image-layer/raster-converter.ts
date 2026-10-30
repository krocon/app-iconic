import { Injectable } from '@angular/core';

export interface PngImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * JPEG / WebP → PNG (prompt 080 E1: `.icon` assets are PNG or SVG): decoded and drawn once by the
 * browser, written by `<canvas>.toDataURL`. Tests replace it (jsdom has no canvas).
 */
@Injectable({ providedIn: 'root' })
export class RasterConverter {
  async toPng(url: string): Promise<PngImage | null> {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const { naturalWidth: width, naturalHeight: height } = img;
      if (!(width > 0 && height > 0)) return null;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      return dataUrl.startsWith('data:image/png;base64,') ? { dataUrl, width, height } : null;
    } catch {
      return null;
    }
  }
}
