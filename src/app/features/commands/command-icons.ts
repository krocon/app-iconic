/**
 * Icons of the command sidebar (design 008 E10): own 16 × 16 outlines in the style of the tree
 * icons (`hierarchy/tree-icons.ts`, drawn with `stroke: currentColor`) – no SF Symbols
 * (CLAUDE.md §7).
 */
export const COMMAND_ICONS: Record<string, string> = {
  'add.iconGroup': 'M2 5l6-3 6 3-6 3z M2 8l6 3 6-3 M2 11l6 3 6-3',
  'add.container': 'M2 4.5h4l1.5 1.5H14v6.5H2z',
  'add.circle': 'M8 3a5 5 0 1 0 0.01 0',
  'add.ellipse': 'M8 4.5c3.3 0 5.5 1.6 5.5 3.5S11.3 11.5 8 11.5 2.5 9.9 2.5 8 4.7 4.5 8 4.5z',
  'add.rect': 'M3 4h10v8H3z',
  'add.path': 'M8 2.5l5.5 10h-11z',
  'add.line': 'M3 13L13 3',
  'add.polyline': 'M2.5 12l5.5-8 5.5 8',
  'add.polygon': 'M8 2.5l5.5 4-2 6.5h-7l-2-6.5z',
  'add.text': 'M3.5 4h9 M8 4v9 M6 13h4',
  'add.freehand': 'M2.5 11c2-5 4 1 6-3s3-4 5-3 M11 13.5l2.5-2.5',
  'add.textToPath': 'M2.5 4h6 M5.5 4v8 M10 6.5h3.5v6H10z',
  'add.symbol': 'M8 2.5l1.7 3.5 3.8.5-2.8 2.6.7 3.8L8 11.1l-3.4 1.8.7-3.8-2.8-2.6 3.8-.5z',
  'add.svgSnippet': 'M5 3.5L2.5 8 5 12.5 M11 3.5L13.5 8 11 12.5 M9 3l-2 10',
  'add.image': 'M2.5 3.5h11v9h-11z M5.5 6.5h0.01 M2.5 11l4-4 3 3 1.5-1.5 2.5 2.5',
};
