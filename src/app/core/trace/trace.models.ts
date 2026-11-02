/**
 * Mirror of the tracing DTOs of Rust `ai-core::trace` (prompt 087, design 087 Verträge). Keep both
 * sides in sync by hand; every change on both sides + a test.
 */

export type TraceColorMode = 'color' | 'mono';
/** Smooth curves, straight edges, exact pixel steps (pixel art). */
export type TraceCurveMode = 'spline' | 'polygon' | 'pixel';

/** What and how to trace; Rust fills missing fields with its defaults (vtracer's). */
export interface TraceOptions {
  mode: TraceColorMode;
  curves: TraceCurveMode;
  /** Significant bits per channel, 1–8. */
  colorPrecision: number;
  /** Colour difference between stacked regions, 0–255. */
  layerDifference: number;
  /** Regions smaller than speckle × speckle pixels are dropped, 0–128. */
  speckle: number;
  /** Degrees (0–180): sharper turns are corners. */
  cornerThreshold: number;
  /** Shortest curve segment in pixels, 3.5–10. */
  lengthThreshold: number;
  /** Degrees (0–180): splines are split at turns over this. */
  spliceThreshold: number;
  /** Black and white: luminance below this is black (0–255). */
  threshold: number;
  /** Stage B: rectangles, rounded rectangles, ellipses, circles. */
  shapes: boolean;
  /** Stage B: bands of a gradient joined, `linearGradient` fills. */
  gradients: boolean;
  /** Stage B: equal shapes equal, shared edges, near colours one colour. */
  harmonize: boolean;
  /** Leave out the bottom region when it fills the image. */
  dropBackground: boolean;
  /** Output units per image pixel (0.01–64). */
  scale: number;
}

export interface TraceStats {
  elements: number;
  paths: number;
  /** Rectangles and rounded rectangles. */
  rects: number;
  /** Ellipses and circles. */
  ellipses: number;
  gradients: number;
  colors: number;
  ms: number;
}

/** The SVG of the new layer in output units, its size, the summary. */
export interface TraceResult {
  svg: string;
  width: number;
  height: number;
  stats: TraceStats;
}

/** The ranges Rust checks (`TraceOptions::check`, `invalid_request` otherwise). */
export const TRACE_LIMITS = {
  colorPrecision: { min: 1, max: 8 },
  layerDifference: { min: 0, max: 255 },
  speckle: { min: 0, max: 128 },
  threshold: { min: 0, max: 255 },
  scale: { min: 0.01, max: 64 },
} as const;
