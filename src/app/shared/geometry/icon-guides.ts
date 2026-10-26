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
