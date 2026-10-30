/**
 * Icons of the command sidebar (design 008 E10): own 16 × 16 outlines in the style of the tree
 * icons (`hierarchy/tree-icons.ts`, drawn with `stroke: currentColor`) – no SF Symbols
 * (CLAUDE.md §7).
 */
export const COMMAND_ICONS: Record<string, string> = {
  // the selection tools (prompt 061): a pointer; the direct selection with a point
  'tool.select': 'M4 2.5v10l2.6-2.4 1.9 4 1.6-.8-1.9-3.9h3.5z',
  'tool.direct': 'M3 2.5v9l2.3-2.1 1.7 3.6 1.4-.7-1.7-3.5h3.1z M11 11h3v3h-3z',
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
  // sketch tools (prompt 019): the shape plus its construction points
  'sketch.line': 'M3 13L13 3 M2 12h2v2H2z M12 2h2v2h-2z',
  'sketch.midpointLine': 'M2.5 13.5l11-11 M7 7h2v2H7z',
  'sketch.rect2p': 'M3 5h10v8H3z M2 4h2v2H2z M12 12h2v2h-2z',
  'sketch.rect3p': 'M2.5 9.5L8 3l5.5 4.5L8 14z M1.5 8.5h2v2h-2z M7 2h2v2H7z',
  'sketch.rectCenter': 'M3 4h10v8H3z M7 7h2v2H7z',
  'sketch.circleCenter': 'M8 3a5 5 0 1 0 0.01 0 M7.5 7.5h1v1h-1z M8 8l3.5-3.5',
  'sketch.circle2p': 'M8 3a5 5 0 1 0 0.01 0 M2 7h2v2H2z M12 7h2v2h-2z',
  'sketch.circle3p': 'M8 3a5 5 0 1 0 0.01 0 M7 2h2v2H7z M2.5 9.5h2v2h-2z M11.5 9.5h2v2h-2z',
  'sketch.circle2t': 'M9 4a4 4 0 1 0 0.01 0 M2 2v12 M2 12h12',
  'sketch.circle3t': 'M8 6a3.2 3.2 0 1 0 0.01 0 M1.5 13.5h13 M2 13.5L8 2l6 11.5',
  'sketch.arc3p': 'M3 12A6 6 0 0 1 13 12 M2 11h2v2H2z M12 11h2v2h-2z M7 5h2v2H7z',
  'sketch.arcCenter': 'M13 9A5 5 0 0 0 8 4 M7.5 8.5h1v1h-1z M8 9h5',
  'sketch.arcTangent': 'M2 12h5 M7 12a5 5 0 0 0 5-5 M6 11h2v2H6z',
  'sketch.polygonCircumscribed':
    'M8 1.5l5.6 3.25v6.5L8 14.5l-5.6-3.25v-6.5z M8 3.2a4.8 4.8 0 1 0 0.01 0 M7.5 7.5h1v1h-1z',
  'sketch.polygonInscribed':
    'M8 3l4.3 2.5v5L8 13l-4.3-2.5v-5z M8 2a6 6 0 1 0 0.01 0 M7.5 7.5h1v1h-1z',
  'pen.tool': 'M3 13l2.5-6.5L11 3l2 2-3.5 5.5L3 13z M3 13l4-4 M7.5 7.5h1v1h-1z',
  'curvature.tool': 'M2 12c3-8 9-8 12 0 M2 11h2v2H2z M7 3.5h2v2H7z M12 11h2v2h-2z',
  'sketch.dragRoundRect': 'M5 4h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  'sketch.dragStar': 'M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z',
  'sketch.dragSpiral': 'M8 8a1 1 0 0 1 2 0 2 2 0 0 1-4 0 3.5 3.5 0 0 1 7 0 5 5 0 0 1-10 0',
  'sketch.dragRectGrid': 'M2.5 2.5h11v11h-11z M2.5 6.2h11 M2.5 9.8h11 M6.2 2.5v11 M9.8 2.5v11',
  'sketch.dragPolarGrid': 'M8 2a6 6 0 1 0 0.01 0 M8 5a3 3 0 1 0 0.01 0 M8 2v12 M2 8h12',
  'sketch.dragArc': 'M3 13C3 7 7 3 13 3',
  'sketch.dragRect': 'M3 4h10v8H3z M12 11l3 3',
  'sketch.dragEllipse': 'M8 4a5.5 4 0 1 0 0.01 0 M12 11l3 3',
  'sketch.dragPolygon': 'M8 2.5l5 3.6-1.9 5.9H4.9L3 6.1z M12 11l3 3',
  'sketch.dragLine': 'M3 13L12 4 M12 11l3 3',
  'sketch.polygonEdge': 'M5 13l-2.5-5L8 2.5l5.5 5.5L11 13z M4 12h2v2H4z M10 12h2v2h-2z',
  // Trim and Extend (prompt 050)
  'trim.tool': 'M2 8h12 M8 2v4 M8 10v4 M10.5 4.5l3 3 M13.5 4.5l-3 3',
  'extend.tool': 'M2 8h7 M11 8h3 M14 3v10 M9 6l2 2-2 2',
  // Fillet and Chamfer (prompt 051)
  'fillet.tool': 'M2.5 13.5V9a6.5 6.5 0 0 1 6.5-6.5h4.5',
  'chamfer.tool': 'M2.5 13.5V7l4.5-4.5h6.5',
  // Offset Path and Outline Stroke (prompt 052)
  'path.offset': 'M5 5h6v6H5z M2.5 2.5h11v11h-11z',
  'path.outlineStroke': 'M2 11L11 2 M4.5 13.5L13.5 4.5 M2 11l2.5 2.5 M11 2l2.5 2.5',
  // path tools (prompt 046)
  'path.addAnchor': 'M2 13L13 2 M6.5 7.5h2v2h-2z M11 12h4 M13 10v4',
  'path.deleteAnchor': 'M2 13L13 2 M6.5 7.5h2v2h-2z M11 12h4',
  'path.anchorPoint': 'M2 12l6-8 6 8 M7 3h2v2H7z',
  'path.scissors':
    'M4.5 11.5a2 2 0 1 0 0.01 0 M11.5 11.5a2 2 0 1 0 0.01 0 M5.8 10L11 2.5 M10.2 10L5 2.5',
  'path.smooth': 'M2 11l3-4 3 4 3-4 3 4 M2 13c4-3 8-3 12 0',
  'path.eraser': 'M2 12c3-6 6-6 7-4 M9.5 13.5l4-4-2-2-4 4z',
  // Shape Builder and cuts (prompt 047)
  'shapeBuilder.tool': 'M6 3a4 4 0 1 0 0.01 0 M10 5a4 4 0 1 0 0.01 0 M9 9l4.5 4.5 M12 14h2v-2',
  'cut.knife': 'M2.5 13.5L11 5l2.5 0.5-1 2.5L4 14z',
  'cut.lineCut': 'M3 3h10v10H3z M1.5 14.5l13-13',
  'cut.rectCut': 'M2.5 2.5h8v8h-8z M6 6h7.5v7.5H6z',
  // patterns, mirror, clone (prompt 049)
  'pattern.circular':
    'M8 2.5a1.5 1.5 0 1 0 0.01 0 M13 7a1.5 1.5 0 1 0 0.01 0 M11 12.5a1.5 1.5 0 1 0 0.01 0 M5 12.5a1.5 1.5 0 1 0 0.01 0 M3 7a1.5 1.5 0 1 0 0.01 0',
  'pattern.rectangular': 'M2.5 2.5h3v3h-3z M10.5 2.5h3v3h-3z M2.5 10.5h3v3h-3z M10.5 10.5h3v3h-3z',
  'pattern.mirror': 'M8 1.5v13 M6 4L2 12h4z M10 4l4 8h-4z',
  'edit.cloneLinked': 'M2.5 2.5h7v7h-7z M6.5 6.5h7v7h-7z M9 11l1.5 1.5L13 10',
  // Measure and Dimension (prompt 048)
  'dimension.tool': 'M2 11h12 M2 8.5v5 M14 8.5v5 M4 9.5L2 11l2 1.5 M12 9.5l2 1.5-2 1.5 M6 6h4',
  'measure.tool': 'M2 10.5L10.5 2 14 5.5 5.5 14z M5 9l1.5 1.5 M7 7l1 1 M9 5l1.5 1.5',
  // constraints (prompt 059): a parallel sign and a lock; solve: arrows round a dimension
  'constraint.tool': 'M4 13L9 3 M8 13l5-10 M2.5 8h11',
  'constraint.solve': 'M3 8a5 5 0 0 1 9-3 M13 8a5 5 0 0 1-9 3 M12 2v3H9 M4 14v-3h3',
  // live fill (prompt 060): a paint bucket
  'fill.tool':
    'M3 8l5-5 5 5-5 5z M3 8h10 M13.5 10.5c.8 1.2 1 2 .3 2.6-.7.5-1.5 0-1.3-.9.1-.6.5-1.1 1-1.7z',
  'add.image': 'M2.5 3.5h11v9h-11z M5.5 6.5h0.01 M2.5 11l4-4 3 3 1.5-1.5 2.5 2.5',
};
