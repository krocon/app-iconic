import { signal } from '@angular/core';

/** Natural pixel size of a raster image (= points on the icon, design 080 Belege). */
export interface RasterSize {
  width: number;
  height: number;
}

/**
 * Natural sizes of raster assets by data URL (prompt 080 E7): filled from the image header the
 * backend read ("Import Image as Layer") or by decoding once. The canvas places a PNG at its size
 * right away, the export and the layer handles read it. `rasterSizeVersion` counts every new entry.
 */
const sizes = new Map<string, RasterSize>();
const pending = new Map<string, Promise<RasterSize | null>>();
const version = signal(0);

export const rasterSizeVersion = version.asReadonly();

export function knownRasterSize(url: string): RasterSize | null {
  return sizes.get(url) ?? null;
}

export function rememberRasterSize(url: string, width: number, height: number): void {
  if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) return;
  const old = sizes.get(url);
  if (old && old.width === width && old.height === height) return;
  sizes.set(url, { width, height });
  version.update((v) => v + 1);
}

/** The size, decoding the image once if needed; `null` if it cannot be decoded here. */
export function loadRasterSize(url: string): Promise<RasterSize | null> {
  const known = sizes.get(url);
  if (known) return Promise.resolve(known);
  let p = pending.get(url);
  if (!p) {
    p = decode(url).then((s) => {
      pending.delete(url);
      if (s) rememberRasterSize(url, s.width, s.height);
      return s;
    });
    pending.set(url, p);
  }
  return p;
}

async function decode(url: string): Promise<RasterSize | null> {
  if (typeof Image === 'undefined') return null;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null;
  } catch {
    // not decodable here (or no layout engine)
    return null;
  }
}

/** Tests: forget everything. */
export function clearRasterSizes(): void {
  sizes.clear();
  pending.clear();
  version.set(0);
}
