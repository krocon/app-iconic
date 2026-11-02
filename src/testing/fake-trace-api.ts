import { FsError } from '../app/core/errors/fs-error';
import { TraceApi } from '../app/core/trace/trace-api';
import { TraceOptions, TraceResult } from '../app/core/trace/trace.models';

const fail = (code: FsError['code'], message: string): Promise<never> =>
  Promise.reject({ code, message, path: null } satisfies FsError);

/**
 * A PNG data URL with a real signature and IHDR (size), no pixels – enough for the fakes and for
 * tests that only read the header.
 */
export function fakePng(width: number, height: number): string {
  const bytes = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  ];
  for (const v of [width, height])
    bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  bytes.push(8, 6, 0, 0, 0);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

/** Width and height from a PNG data URL's IHDR chunk (bytes 16–23); `null` for anything else. */
export function pngSize(dataUrl: string): { width: number; height: number } | null {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) return null;
  try {
    const head = atob(dataUrl.slice(prefix.length, prefix.length + 44));
    if (!head.startsWith('\x89PNG')) return null;
    const u32 = (o: number) =>
      ((head.charCodeAt(o) << 24) |
        (head.charCodeAt(o + 1) << 16) |
        (head.charCodeAt(o + 2) << 8) |
        head.charCodeAt(o + 3)) >>>
      0;
    return { width: u32(16), height: u32(20) };
  } catch {
    return null;
  }
}

/**
 * Tracing in memory (prompt 087): no pixels are read – the "trace" of a W × H PNG is a rounded
 * rectangle over the image (a `<rect>` with shapes, a `<path>` without) and a circle, in the
 * image's units times `scale`, with the same checks and error codes as Rust. Never part of the
 * production build.
 */
export class FakeTraceApi extends TraceApi {
  readonly calls: { dataUrl: string; options: Partial<TraceOptions> }[] = [];
  /** Makes the next calls fail with this code. */
  failWith: FsError['code'] | null = null;

  async traceImage(dataUrl: string, options: Partial<TraceOptions>): Promise<TraceResult> {
    this.calls.push({ dataUrl, options: { ...options } });
    if (this.failWith) return fail(this.failWith, 'fake failure');
    const size = pngSize(dataUrl);
    if (!size) return fail('invalid_image', 'not a PNG data URL');
    const scale = options.scale ?? 1;
    if (!(scale >= 0.01 && scale <= 64)) return fail('invalid_request', 'scale');
    const w = size.width * scale;
    const h = size.height * scale;
    const fill = options.mode === 'mono' ? '#000000' : '#3366cc';
    const body = options.shapes
      ? `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) / 8}" fill="${fill}"/>`
      : `<path d="M0 0L${w} 0L${w} ${h}L0 ${h}Z" fill="${fill}"/>`;
    const dot = `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="#ffffff"/>`;
    const gradient = options.gradients
      ? `<defs><linearGradient id="trace-gradient-1" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${h}"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#000000"/></linearGradient></defs>`
      : '';
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${gradient}${body}${dot}</svg>`,
      width: w,
      height: h,
      stats: {
        elements: 2,
        paths: options.shapes ? 0 : 1,
        rects: options.shapes ? 1 : 0,
        ellipses: 1,
        gradients: options.gradients ? 1 : 0,
        colors: 2,
        ms: 1,
      },
    };
  }
}
