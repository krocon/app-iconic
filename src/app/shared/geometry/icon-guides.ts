/**
 * Apple icon grid on the 1024 × 1024 canvas (legacy: Guides "Icon Shape", colour #0A84FF):
 * both diagonals, horizontal and vertical lines every 128 units from 128 to 896, and circles
 * with diameters 820, 512 and 204 around the centre (512, 512). Pure – no DOM.
 */
export const CANVAS_SIZE = 1024;

export interface GuideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface GuideCircle {
  cx: number;
  cy: number;
  r: number;
}

export interface IconGuides {
  lines: GuideLine[];
  circles: GuideCircle[];
}

export const GUIDE_CIRCLE_DIAMETERS = [820, 512, 204] as const;

export function iconGuides(size: number = CANVAS_SIZE): IconGuides {
  const lines: GuideLine[] = [
    { x1: 0, y1: 0, x2: size, y2: size },
    { x1: size, y1: 0, x2: 0, y2: size },
  ];
  for (let v = 128; v <= size - 128; v += 128) {
    lines.push({ x1: 0, y1: v, x2: size, y2: v }, { x1: v, y1: 0, x2: v, y2: size });
  }
  const c = size / 2;
  const circles = GUIDE_CIRCLE_DIAMETERS.map((d) => ({ cx: c, cy: c, r: d / 2 }));
  return { lines, circles };
}

/** Which icon grid the guides draw (prompt 056). */
export type GuideTemplate = 'apple' | 'material' | 'grid';

const rectLines = (x: number, y: number, w: number, h: number): GuideLine[] => [
  { x1: x, y1: y, x2: x + w, y2: y },
  { x1: x + w, y1: y, x2: x + w, y2: y + h },
  { x1: x + w, y1: y + h, x2: x, y2: y + h },
  { x1: x, y1: y + h, x2: x, y2: y },
];

/**
 * Material Design keylines on the 24-unit icon grid, scaled to the canvas: live area (2 units
 * padding), centre lines, diagonals, the keyline circle (⌀ 20), square (18), portrait (16 × 20)
 * and landscape (20 × 16) rectangles.
 */
export function materialGuides(size: number = CANVAS_SIZE): IconGuides {
  const u = size / 24;
  const c = size / 2;
  const lines: GuideLine[] = [
    { x1: 0, y1: 0, x2: size, y2: size },
    { x1: size, y1: 0, x2: 0, y2: size },
    { x1: c, y1: 0, x2: c, y2: size },
    { x1: 0, y1: c, x2: size, y2: c },
    ...rectLines(2 * u, 2 * u, 20 * u, 20 * u),
    ...rectLines(3 * u, 3 * u, 18 * u, 18 * u),
    ...rectLines(4 * u, 2 * u, 16 * u, 20 * u),
    ...rectLines(2 * u, 4 * u, 20 * u, 16 * u),
  ];
  return { lines, circles: [{ cx: c, cy: c, r: 10 * u }] };
}

/** An even grid of `n` × `n` cells with both diagonals. */
export function gridGuides(n: number, size: number = CANVAS_SIZE): IconGuides {
  const k = Math.max(2, Math.min(64, Math.round(n)));
  const lines: GuideLine[] = [
    { x1: 0, y1: 0, x2: size, y2: size },
    { x1: size, y1: 0, x2: 0, y2: size },
  ];
  for (let i = 1; i < k; i++) {
    const v = (size * i) / k;
    lines.push({ x1: 0, y1: v, x2: size, y2: v }, { x1: v, y1: 0, x2: v, y2: size });
  }
  return { lines, circles: [] };
}

export function guidesOf(
  t: GuideTemplate,
  divisions: number,
  size: number = CANVAS_SIZE,
): IconGuides {
  return t === 'material'
    ? materialGuides(size)
    : t === 'grid'
      ? gridGuides(divisions, size)
      : iconGuides(size);
}
