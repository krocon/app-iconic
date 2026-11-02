import { Injectable } from '@angular/core';

export interface PngImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * JPEG / WebP → PNG (prompt 080 E1: `.icon` assets are PNG or SVG): decoded and drawn once by the
 * browser, written by `<canvas>.toDataURL`; with `maxSide` scaled down to fit (the template the
 * AI sees, prompt 087). Tests replace it (jsdom has no canvas).
 */
@Injectable({ providedIn: 'root' })
export class RasterConverter {
  async toPng(url: string, maxSide?: number): Promise<PngImage | null> {
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const { naturalWidth: w0, naturalHeight: h0 } = img;
      if (!(w0 > 0 && h0 > 0)) return null;
      const f = maxSide && Math.max(w0, h0) > maxSide ? maxSide / Math.max(w0, h0) : 1;
      const width = Math.max(1, Math.round(w0 * f));
      const height = Math.max(1, Math.round(h0 * f));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');
      return dataUrl.startsWith('data:image/png;base64,') ? { dataUrl, width, height } : null;
    } catch {
      return null;
    }
  }
}
