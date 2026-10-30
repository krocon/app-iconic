import { TreeNode } from './hierarchy-model';

/**
 * Type icons of the tree (design 006 E3): own 16 × 16 outlines (path data, drawn with
 * `stroke: currentColor`) – no SF Symbols (CLAUDE.md §7).
 */
const ICONS: Record<string, string> = {
  root: 'M3 3h10v10H3z M5.5 5.5h5v5h-5z',
  group: 'M2 5l6-3 6 3-6 3z M2 8l6 3 6-3 M2 11l6 3 6-3',
  layer: 'M2.5 3.5h11v9h-11z M2.5 10l3-3 3 3 2-2 3 3',
  defs: 'M8 2.5v2 M8 11.5v2 M2.5 8h2 M11.5 8h2 M8 5.5a2.5 2.5 0 1 0 0.01 0',
  g: 'M2 4.5h4l1.5 1.5H14v6.5H2z',
  rect: 'M3 4h10v8H3z',
  circle: 'M8 3a5 5 0 1 0 0.01 0',
  ellipse: 'M8 4.5c3.3 0 5.5 1.6 5.5 3.5S11.3 11.5 8 11.5 2.5 9.9 2.5 8 4.7 4.5 8 4.5z',
  line: 'M3 13L13 3',
  polyline: 'M2.5 12l3.5-6 3 4 4-7',
  polygon: 'M8 2.5l5.5 4-2 6.5h-7l-2-6.5z',
  path: 'M2.5 12.5C4 4 12 12 13.5 3.5 M2.5 12.5h0.01 M13.5 3.5h0.01',
  text: 'M3.5 4h9 M8 4v9 M6 13h4',
  image: 'M2.5 3.5h11v9h-11z M5.5 6.5h0.01 M2.5 11l4-4 3 3 1.5-1.5 2.5 2.5',
  use: 'M6 3.5H3.5v9H6 M10 3.5h2.5v9H10 M6 8h4',
  gradient: 'M3 3h10v10H3z M3 13L13 3 M3 8L8 3 M8 13l5-5',
  clip: 'M4 2.5v9h9.5 M2.5 4.5h9v9',
  other: 'M5 3.5L2.5 8 5 12.5 M11 3.5L13.5 8 11 12.5',
  // helpers (prompt 066)
  guide: 'M8 1.5v13 M1.5 8h13',
  dimension: 'M2.5 5v6 M13.5 5v6 M2.5 8h11 M4.5 6.5L2.5 8l2 1.5 M11.5 6.5l2 1.5-2 1.5',
  construction: 'M3 13L13 3 M2.5 13.5h1 M6 10h1 M9.5 6.5h1 M12.5 3h1',
  fill: 'M3 6l5-3.5 5 3.5-5 7.5z M11.5 10.5c0 1.5 2 1.5 2 0l-1-1.5z',
};

const BY_TAG: Record<string, string> = {
  g: 'g',
  a: 'g',
  switch: 'g',
  svg: 'g',
  symbol: 'g',
  defs: 'defs',
  rect: 'rect',
  circle: 'circle',
  ellipse: 'ellipse',
  line: 'line',
  polyline: 'polyline',
  polygon: 'polygon',
  path: 'path',
  text: 'text',
  tspan: 'text',
  textPath: 'text',
  image: 'image',
  use: 'use',
  linearGradient: 'gradient',
  radialGradient: 'gradient',
  pattern: 'gradient',
  clipPath: 'clip',
  mask: 'clip',
};

export function treeIcon(n: TreeNode): string {
  if (n.kind !== 'node') return ICONS[n.kind];
  if (n.role) return ICONS[n.role];
  return ICONS[BY_TAG[n.tag ?? ''] ?? 'other'];
}
