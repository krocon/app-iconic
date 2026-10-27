import { parseSvg } from '../document/svg/node-ids';

/**
 * Natural size of an SVG image from its data URL (design 008 E8): `width`/`height` in user units
 * (px or no unit), else the `viewBox`. The browser parses (DOMParser) – Rust only knows raster
 * headers. `null` if the size is not given.
 */
export function svgDataUrlSize(dataUrl: string): { width: number; height: number } | null {
  const m = /^data:image\/svg\+xml(;[^,]*)?,(.*)$/is.exec(dataUrl);
  if (!m) return null;
  let text: string;
  try {
    if (/;base64/i.test(m[1] ?? '')) {
      const bin = atob(m[2]);
      text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    } else {
      text = decodeURIComponent(m[2]);
    }
  } catch {
    return null;
  }
  const svg = parseSvg(text);
  if (!svg) return null;
  const len = (name: string) => {
    const v = svg.root.getAttribute(name)?.trim() ?? '';
    return /^[+]?(\d*\.\d+|\d+\.?)(e[-+]?\d+)?(px)?$/i.test(v) ? parseFloat(v) : NaN;
  };
  const w = len('width');
  const h = len('height');
  if (w > 0 && h > 0) return { width: w, height: h };
  const vb = (svg.root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    // one given side keeps the viewBox's aspect ratio
    if (w > 0) return { width: w, height: (w * vb[3]) / vb[2] };
    if (h > 0) return { width: (h * vb[2]) / vb[3], height: h };
    return { width: vb[2], height: vb[3] };
  }
  return null;
}

/** A data URL the `<image>` may carry (embedded images only, design 003 E4). */
export function isImageDataUrl(href: string): boolean {
  return /^data:image\/[a-z0-9.+-]+[;,]/i.test(href);
}
