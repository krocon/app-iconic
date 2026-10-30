/**
 * The layout of the command sidebar and the Add menu (design 008 E10; prompt 019; regrouped in
 * prompt 068): the selection tools, then the **tools** (what stays on and takes the pointer), the
 * Fusion-style **construction** tools (2-/3-point, centre, tangent – a collapsible section), what
 * is **inserted** at once, and the **modify** commands (dialogs, changes of the selection) that the
 * sidebar only lists while filtering – they live in the Modify menu and the palette. Action ids
 * never change (keymaps, MCP). Pure.
 */
export type AddSectionKey = 'select' | 'tools' | 'construction' | 'insert' | 'modify';
export type AddGroupKey =
  | 'shapes'
  | 'path'
  | 'editPath'
  | 'combine'
  | 'transform'
  | 'measure'
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'arc'
  | 'polygon'
  | 'centre';

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
  // the selection tools first (prompt 061)
  { section: 'select', entries: [act('tool.select'), act('tool.direct')] },
  {
    section: 'tools',
    entries: [
      group('shapes', [
        'sketch.dragRect',
        'sketch.dragRoundRect',
        'sketch.dragEllipse',
        'sketch.dragPolygon',
        'sketch.dragStar',
        'sketch.dragLine',
        'sketch.dragArc',
        'sketch.dragSpiral',
        'sketch.dragRectGrid',
        'sketch.dragPolarGrid',
      ]),
      group('path', ['pen.tool', 'curvature.tool']),
      act('add.freehand'),
      act('fill.tool'),
      act('shapeBuilder.tool'),
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
      group('combine', ['cut.knife', 'cut.lineCut', 'cut.rectCut']),
      group('transform', ['transform.rotate', 'transform.scale', 'transform.reflect']),
      act('constraint.tool'),
      group('measure', ['dimension.tool', 'measure.tool']),
    ],
  },
  {
    section: 'construction',
    entries: [
      group('line', ['sketch.line', 'sketch.midpointLine']),
      group('rectangle', ['sketch.rect2p', 'sketch.rect3p', 'sketch.rectCenter']),
      group('circle', [
        'sketch.circleCenter',
        'sketch.circle2p',
        'sketch.circle3p',
        'sketch.circle2t',
        'sketch.circle3t',
      ]),
      group('arc', ['sketch.arc3p', 'sketch.arcCenter', 'sketch.arcTangent']),
      group('polygon', [
        'sketch.polygonCircumscribed',
        'sketch.polygonInscribed',
        'sketch.polygonEdge',
      ]),
    ],
  },
  {
    section: 'insert',
    entries: [
      act('add.iconGroup'),
      act('add.layer'),
      act('add.container'),
      group('centre', [
        'add.rect',
        'add.circle',
        'add.ellipse',
        'add.line',
        'add.polyline',
        'add.polygon',
        'add.path',
      ]),
      act('add.text'),
      act('add.textToPath'),
      act('add.symbol'),
      act('add.svgSnippet'),
      act('add.image'),
    ],
  },
  {
    // only while filtering in the sidebar; the Modify menu and the palette show them
    section: 'modify',
    entries: [
      act('path.offset'),
      act('path.outlineStroke'),
      act('corners.set'),
      act('path.optimize'),
      act('path.join'),
      act('path.convert'),
      act('pattern.circular'),
      act('pattern.rectangular'),
      act('pattern.mirror'),
      act('edit.cloneLinked'),
      act('constraint.solve'),
      act('fill.detach'),
    ],
  },
];

/** The action ids of one entry (a group: its variants). */
export function entryIds(e: AddEntry): readonly string[] {
  return e.kind === 'action' ? [e.id] : e.ids;
}

/** Every action of a layout in order. */
export function addLayoutIds(layout: readonly AddSection[] = ADD_LAYOUT): string[] {
  return layout.flatMap((s) => s.entries.flatMap(entryIds));
}

/** The sections of the Add menu: everything but the selection tools (prompt 061). */
export const ADD_MENU_LAYOUT: readonly AddSection[] = ADD_LAYOUT.filter(
  (s) => s.section !== 'select' && s.section !== 'modify',
);

/** The Modify commands (prompt 068): the Modify menu, the palette, the sidebar's filter. */
export const MODIFY_IDS: readonly string[] = addLayoutIds(
  ADD_LAYOUT.filter((s) => s.section === 'modify'),
);

/**
 * The tools whose name the status line shows (prompt 061): the selection tools and every entry of
 * the layout but the Modify commands; the active one is the checked one.
 */
export const TOOL_ACTION_IDS: readonly string[] = addLayoutIds(
  ADD_LAYOUT.filter((s) => s.section !== 'modify'),
);

/** The checked tool of {@link TOOL_ACTION_IDS} (a tool on, else a selection tool), or `null`. */
export function activeToolId(checked: (id: string) => boolean | undefined): string | null {
  return TOOL_ACTION_IDS.find((id) => checked(id) === true) ?? null;
}
