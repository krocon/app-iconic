/**
 * The layout of the "Add" functions, shared by the command sidebar and the Add menu (design 008
 * E10; prompt 019): by shape like Fusion's "Create" menu – the variants of one shape in a submenu,
 * the one-click variant at the centre first, then the sketch tools. Pure.
 */
export type AddSectionKey = 'structure' | 'shapes' | 'text' | 'import';
export type AddGroupKey =
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'arc'
  | 'polygon'
  | 'path'
  | 'editPath'
  | 'combine'
  | 'pattern'
  | 'measure'
  | 'more';

export type AddEntry =
  { kind: 'action'; id: string } | { kind: 'group'; group: AddGroupKey; ids: readonly string[] };

export interface AddSection {
  section: AddSectionKey;
  entries: readonly AddEntry[];
}

const act = (id: string): AddEntry => ({ kind: 'action', id });
const group = (key: AddGroupKey, ids: readonly string[]): AddEntry => ({
  kind: 'group',
  group: key,
  ids,
});

export const ADD_LAYOUT: readonly AddSection[] = [
  { section: 'structure', entries: [act('add.iconGroup'), act('add.container')] },
  {
    section: 'shapes',
    entries: [
      group('line', [
        'add.line',
        'sketch.dragLine',
        'sketch.line',
        'sketch.midpointLine',
        'add.polyline',
      ]),
      group('rectangle', [
        'add.rect',
        'sketch.dragRect',
        'sketch.dragRoundRect',
        'sketch.rect2p',
        'sketch.rect3p',
        'sketch.rectCenter',
      ]),
      group('circle', [
        'add.circle',
        'sketch.circleCenter',
        'sketch.circle2p',
        'sketch.circle3p',
        'sketch.circle2t',
        'sketch.circle3t',
      ]),
      group('arc', ['sketch.dragArc', 'sketch.arc3p', 'sketch.arcCenter', 'sketch.arcTangent']),
      group('polygon', [
        'add.polygon',
        'sketch.dragPolygon',
        'sketch.dragStar',
        'sketch.polygonCircumscribed',
        'sketch.polygonInscribed',
        'sketch.polygonEdge',
      ]),
      group('ellipse', ['add.ellipse', 'sketch.dragEllipse']),
      group('path', ['add.path', 'pen.tool', 'curvature.tool']),
      group('editPath', [
        'trim.tool',
        'extend.tool',
        'fillet.tool',
        'chamfer.tool',
        'path.addAnchor',
        'path.deleteAnchor',
        'path.anchorPoint',
        'path.scissors',
        'path.smooth',
        'path.eraser',
      ]),
      group('combine', ['shapeBuilder.tool', 'cut.knife', 'cut.lineCut', 'cut.rectCut']),
      group('pattern', [
        'pattern.circular',
        'pattern.rectangular',
        'pattern.mirror',
        'edit.cloneLinked',
      ]),
      group('measure', ['dimension.tool', 'measure.tool']),
      group('more', ['sketch.dragSpiral', 'sketch.dragRectGrid', 'sketch.dragPolarGrid']),
      act('add.freehand'),
    ],
  },
  { section: 'text', entries: [act('add.text'), act('add.textToPath')] },
  { section: 'import', entries: [act('add.symbol'), act('add.svgSnippet'), act('add.image')] },
];

/** The action ids of one entry (a group: its variants). */
export function entryIds(e: AddEntry): readonly string[] {
  return e.kind === 'action' ? [e.id] : e.ids;
}

/** Every add action in layout order. */
export function addLayoutIds(layout: readonly AddSection[] = ADD_LAYOUT): string[] {
  return layout.flatMap((s) => s.entries.flatMap(entryIds));
}
