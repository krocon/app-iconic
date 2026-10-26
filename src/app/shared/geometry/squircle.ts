import { CANVAS_SIZE } from './icon-guides';

/**
 * Corner radius of the Apple app icon shape relative to its edge (design 004 E8; the value widely
 * used for iOS icons since iOS 7 – to be checked against Icon Composer, question 4).
 */
export const ICON_CORNER_RATIO = 0.2237;

/** Where a corner starts, in multiples of the radius, measured from the corner along the edge. */
export const CORNER_START = 1.528665;

type UV = readonly [number, number];

/**
 * One corner of Apple's "continuous corner" rounded rectangle (curvature-continuous corners of
 * `UIBezierPath(roundedRect:cornerRadius:)` since iOS 7, as reconstructed by PaintCode): a line to
 * the start and three cubic Béziers, in multiples of the radius. `u` = distance from the corner
 * along the incoming edge, `v` = distance from that edge (the curve is symmetric in u/v).
 */
const CORNER: readonly (readonly UV[])[] = [
  [[CORNER_START, 0]],
  [
    [1.088493, 0],
    [0.868406, 0],
    [0.631493, 0.074911],
  ],
  [
    [0.372824, 0.16906],
    [0.16906, 0.372824],
    [0.074911, 0.631493],
  ],
  [
    [0, 0.868406],
    [0, 1.088493],
    [0, CORNER_START],
  ],
];

/**
 * SVG path of the iOS/macOS icon mask ("squircle") for a square of `size` units at the origin,
 * clockwise from the top edge. Pure. The radius is limited so that the corners do not overlap.
 */
export function squirclePath(size = CANVAS_SIZE, radius = size * ICON_CORNER_RATIO): string {
  const s = size;
  const r = Math.min(radius, s / 2 / CORNER_START);
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  // (u, v) → (x, y) for the four corners, each reached along the edge before it (clockwise)
  const corners: ((u: number, v: number) => [number, number])[] = [
    (u, v) => [s - u, v], // top right, along the top edge
    (u, v) => [s - v, s - u], // bottom right, along the right edge
    (u, v) => [u, s - v], // bottom left, along the bottom edge
    (u, v) => [v, u], // top left, along the left edge
  ];
  const parts = corners.map((map) =>
    CORNER.map((seg, i) => {
      const pts = seg
        .map(([u, v]) =>
          map(u * r, v * r)
            .map(n)
            .join(' '),
        )
        .join(' ');
      return `${i === 0 ? 'L' : 'C'} ${pts}`;
    }).join(' '),
  );
  const [x0, y0] = corners[3](0, CORNER_START * r);
  return `M ${n(x0)} ${n(y0)} ${parts.join(' ')} Z`;
}
