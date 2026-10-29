import { ArgsSpec } from './action-args';
import { IMAGE_ARGS, shapeArgsSpec, SNIPPET_ARGS } from './add-action-args';
import { EXPORT_ARGS } from './export-action-args';
import {
  CLIP_ASSIGN_ARGS,
  CLIP_CREATE_ARGS,
  CLIP_REMOVE_ARGS,
  CLIP_TARGET_ARGS,
  CLIP_UNITS_ARGS,
} from './clip-action-args';
import { FREEHAND_ARGS, SYMBOL_ARGS, TEXT_PATH_ARGS } from './tool-action-args';
import { SKETCH_ARGS, PEN_ARGS, CURVATURE_ARGS } from './sketch-action-args';

/**
 * Every function of the app as an action (design 005 E1; taken over from editlicious
 * `core/actions/action-catalog.ts`, there from comic-commander design 008): id, text, context and
 * menu group. Shortcuts live in the keymaps (`keymap.*.json`), handlers are registered by the
 * features (`ActionService`). Menus, the command palette, the keyboard – and the AI over MCP
 * (prompt 018) – all run actions by id. Entries whose function a later prompt brings stand here
 * already; without a handler they are disabled. Texts: English = source, German in
 * `action-catalog.de.ts` (design 015 E13).
 */

/**
 * Where a shortcut is active (design 005 E4): `global` everywhere, `canvas` / `hierarchy` while
 * the focus is there (before `global`), `dialog` while a dialog is open (nothing else then).
 */
export type ActionContext = 'global' | 'drawing' | 'canvas' | 'hierarchy' | 'dialog';

/** The menu an action belongs to (palette and shortcut overview group by it). */
export type ActionGroup = 'app' | 'file' | 'edit' | 'view' | 'add' | 'arrange' | 'help';

export interface ActionDef {
  id: string;
  label: string;
  context: ActionContext;
  group: ActionGroup;
  /** Shown in the command palette (default: yes). */
  palette?: boolean;
  /** Held key repeats the action; else once per press. */
  repeat?: boolean;
  /** Runs while the key is held (`run` on press, `release` on release – Space = pan). */
  hold?: boolean;
  /** In text fields the browser keeps the key (copy, paste, undo of the field). */
  nativeInText?: boolean;
  /** Serialisable arguments (`ActionService.run(id, args)`, AI rule). */
  args?: ArgsSpec;
}

/** Appearance of an icon property (design 010 E2). */
const APPEARANCE_ARG = { type: 'string', enum: ['default', 'dark', 'tinted'] } as const;
const INDEX = { type: 'integer', minimum: 0 } as const;
/** Group / layer of an icon property; none = the icon itself. */
const TARGET_ARGS = { group: INDEX, layer: INDEX } as const;

/** Recently used files reachable from the menu ("Open Recent ›"). */
export const MAX_RECENT_ACTIONS = 10;

type Extra = Partial<Omit<ActionDef, 'id' | 'label' | 'group'>>;

function group(g: ActionGroup) {
  return (id: string, label: string, extra: Extra = {}): ActionDef => ({
    id,
    label,
    context: 'global',
    group: g,
    ...extra,
  });
}

const APP = group('app');
const FILE = group('file');
const EDIT = group('edit');
const VIEW = group('view');
const ADD = group('add');
const ARRANGE = group('arrange');
const HELP = group('help');
/** Keys of the tree (design 006 E5): context `hierarchy`, not in the palette. */
const TREE = (id: string, label: string): ActionDef => ({
  id,
  label,
  context: 'hierarchy',
  group: 'edit',
  palette: false,
});

/** Arrow keys on the canvas (design 007 E12): 1 document unit, with ⇧ 10. */
export const NUDGES: readonly [string, string, number, number][] = [
  ['arrange.nudge.left', 'Nudge Left', -1, 0],
  ['arrange.nudge.right', 'Nudge Right', 1, 0],
  ['arrange.nudge.up', 'Nudge Up', 0, -1],
  ['arrange.nudge.down', 'Nudge Down', 0, 1],
  ['arrange.nudge.leftBig', 'Nudge Left ×10', -10, 0],
  ['arrange.nudge.rightBig', 'Nudge Right ×10', 10, 0],
  ['arrange.nudge.upBig', 'Nudge Up ×10', 0, -10],
  ['arrange.nudge.downBig', 'Nudge Down ×10', 0, 10],
];

/** Clipboard and editing keys stay with text fields (design 005 E4/E7). */
const TEXT: Extra = { nativeInText: true };

export const ACTIONS: readonly ActionDef[] = [
  // app (macOS: About and Quit in the app menu)
  APP('app.palette', 'Command Palette…', { palette: false }),
  APP('app.about', 'About AppIconic'),
  APP('app.settings', 'Settings…'),
  // AI control (design 018 E16): closes every connection of AI assistants (MCP)
  APP('mcp.disconnect', 'Disconnect AI'),
  // settings (design 015 E11): `key` is a path of `SETTING_KEYS` (`canvas.rulers`, `theme` …)
  APP('settings.set', 'Change a Setting', {
    palette: false,
    args: {
      type: 'object',
      required: ['key', 'value'],
      properties: { key: { type: 'string', maxLength: 64 }, value: { type: 'json' } },
    },
  }),
  // `confirm: false` resets without asking (AI, tests)
  APP('settings.reset', 'Reset Settings to Default…', {
    args: { type: 'object', properties: { confirm: { type: 'boolean' } } },
  }),
  APP('app.quit', 'Quit AppIconic'),
  APP('app.focusMenu', 'Focus the menu bar', { palette: false }),
  // file (legacy §4)
  FILE('file.newWindow', 'New Window'),
  FILE('file.new', 'New Document'),
  FILE('file.open', 'Open…'),
  ...Array.from({ length: MAX_RECENT_ACTIONS }, (_, i) =>
    FILE(`file.recent.${i + 1}`, `Open Recent File ${i + 1}`),
  ),
  FILE('file.noRecent', 'No Recent Items', { palette: false }),
  FILE('file.clearRecent', 'Clear Recent Menu'),
  FILE('file.importSvg', 'Import SVG…'),
  // without arguments the export dialog; with them straight to the files (design 012 E14)
  FILE('file.exportSvg', 'Export SVG…', { args: EXPORT_ARGS }),
  FILE('file.exportPng', 'Export PNG…', { args: EXPORT_ARGS }),
  FILE('file.revealExport', 'Show Last Export in Folder'),
  FILE('file.save', 'Save'),
  FILE('file.saveAs', 'Save As…'),
  FILE('file.close', 'Close'),
  // edit (legacy §4, §7.2, §12)
  EDIT('edit.undo', 'Undo', TEXT),
  EDIT('edit.redo', 'Redo', TEXT),
  EDIT('edit.cut', 'Cut', TEXT),
  EDIT('edit.copy', 'Copy', TEXT),
  EDIT('edit.paste', 'Paste', {
    ...TEXT,
    // `text`: paste this markup instead of the clipboard's (AI, tests)
    args: { type: 'object', properties: { text: { type: 'string', maxLength: 16 << 20 } } },
  }),
  EDIT('edit.copyXml', 'Copy XML'),
  EDIT('edit.duplicate', 'Duplicate'),
  EDIT('edit.delete', 'Delete', {
    ...TEXT,
    // `confirm`: ask first ("Delete…" of the context menu, design 006 E8)
    args: { type: 'object', properties: { confirm: { type: 'boolean' } } },
  }),
  // without `markup` the dialog opens; with it the target is replaced directly (AI, design 011 E13)
  EDIT('edit.editSvg', 'Edit SVG…', {
    args: { type: 'object', properties: { markup: { type: 'string', maxLength: 32 << 20 } } },
  }),
  // without arguments the preview dialog opens (design 011 E12)
  EDIT('path.optimize', 'Optimize Path…', {
    args: {
      type: 'object',
      properties: {
        epsilon: { type: 'number', minimum: 0, maximum: 100 },
        precision: { type: 'integer', minimum: 0, maximum: 6 },
      },
    },
  }),
  EDIT('edit.toggleVisibility', 'Show/Hide', {
    args: { type: 'object', properties: { recursive: { type: 'boolean' } } },
  }),
  EDIT('edit.selectAll', 'Select All', TEXT),
  EDIT('edit.deselect', 'Deselect'),
  // selection as JSON (AI, tests; design 006 E16): `{ nodes?: NodeRef[], items?: IconItem[] }`
  EDIT('edit.select', 'Select', {
    palette: false,
    args: { type: 'object', properties: { nodes: { type: 'json' }, items: { type: 'json' } } },
  }),
  EDIT('edit.runCommand', 'Run a document command', {
    palette: false,
    args: {
      type: 'object',
      required: ['command'],
      properties: { command: { type: 'json' } },
    },
  }),
  // properties panel (design 009 E11): the AI sets what the panel sets
  EDIT('properties.set', 'Set Property', {
    palette: false,
    args: {
      type: 'object',
      required: ['name', 'value'],
      properties: {
        name: { type: 'string', maxLength: 255 },
        value: { type: 'string', maxLength: 16 << 20 },
        constrain: { type: 'boolean' },
      },
    },
  }),
  EDIT('properties.reset', 'Reset Property', {
    palette: false,
    args: {
      type: 'object',
      required: ['name'],
      properties: { name: { type: 'string', maxLength: 255 } },
    },
  }),
  EDIT('properties.resetAll', 'Reset All Properties…', {
    // `confirm: false` resets without asking (AI, tests)
    args: { type: 'object', properties: { confirm: { type: 'boolean' } } },
  }),
  // icon inspector (design 010 E14): what the inspector changes, the AI changes the same way
  EDIT('icon.setFill', 'Set Background Fill', {
    palette: false,
    args: {
      type: 'object',
      required: ['fill'],
      properties: { fill: { type: 'json' }, appearance: APPEARANCE_ARG },
    },
  }),
  EDIT('icon.set', 'Set Icon Property', {
    palette: false,
    args: {
      type: 'object',
      required: ['field', 'value'],
      properties: {
        ...TARGET_ARGS,
        field: { type: 'string', maxLength: 64 },
        value: { type: 'json' },
        appearance: APPEARANCE_ARG,
      },
    },
  }),
  EDIT('icon.removeVariant', 'Remove Appearance Variant', {
    palette: false,
    args: {
      type: 'object',
      required: ['field', 'appearance'],
      properties: {
        ...TARGET_ARGS,
        field: { type: 'string', maxLength: 64 },
        appearance: { type: 'string', enum: ['dark', 'tinted'] },
      },
    },
  }),
  EDIT('icon.renameGroup', 'Rename Group', {
    palette: false,
    args: {
      type: 'object',
      required: ['group', 'name'],
      properties: { group: INDEX, name: { type: 'string', maxLength: 255 } },
    },
  }),
  EDIT('icon.renameLayer', 'Rename Layer', {
    palette: false,
    args: {
      type: 'object',
      required: ['group', 'layer', 'name'],
      properties: { group: INDEX, layer: INDEX, name: { type: 'string', maxLength: 255 } },
    },
  }),
  EDIT('icon.renameAsset', 'Rename Asset', {
    palette: false,
    args: {
      type: 'object',
      required: ['from', 'to'],
      properties: {
        from: { type: 'string', maxLength: 255 },
        to: { type: 'string', maxLength: 255 },
      },
    },
  }),
  EDIT('icon.setPlatforms', 'Set Supported Platforms', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        squares: { type: 'string', enum: ['shared', 'iOS', 'macOS', 'iOS+macOS', 'off'] },
        watchOS: { type: 'boolean' },
      },
    },
  }),
  EDIT('icon.setColorSpace', 'Set Color Space of Untagged SVG Colors', {
    palette: false,
    args: {
      type: 'object',
      required: ['space'],
      properties: {
        space: { type: 'string', enum: ['display-p3', 'srgb', 'extended-gray', 'none'] },
      },
    },
  }),
  EDIT('icon.editAppearance', 'Edit Appearance', {
    palette: false,
    args: { type: 'object', required: ['appearance'], properties: { appearance: APPEARANCE_ARG } },
  }),
  EDIT('icon.copyJson', 'Copy icon.json'),
  // path tools (prompt 046): on/off; they edit the selected paths and shapes
  EDIT('path.addAnchor', 'Add Anchor Point Tool'),
  EDIT('path.deleteAnchor', 'Delete Anchor Point Tool'),
  EDIT('path.anchorPoint', 'Anchor Point Tool'),
  EDIT('path.scissors', 'Scissors Tool'),
  EDIT('path.smooth', 'Smooth Tool'),
  EDIT('path.eraser', 'Path Eraser Tool'),
  EDIT('path.join', 'Join Paths'),
  EDIT('path.convert', 'Convert to Path'),
  // Pathfinder, Shape Builder, cuts (prompt 047)
  EDIT('pathfinder.unite', 'Unite'),
  EDIT('pathfinder.minusFront', 'Minus Front'),
  EDIT('pathfinder.intersect', 'Intersect'),
  EDIT('pathfinder.exclude', 'Exclude'),
  EDIT('pathfinder.divide', 'Divide'),
  EDIT('shapeBuilder.tool', 'Shape Builder Tool'),
  EDIT('cut.knife', 'Knife Tool'),
  EDIT('cut.lineCut', 'Line Cut Tool'),
  EDIT('cut.rectCut', 'Rectangle Cut Tool'),
  // Measure and Dimension (prompt 048)
  ADD('dimension.tool', 'Dimension Tool'),
  VIEW('measure.tool', 'Measure Tool'),
  ADD('dimension.add', 'Add Dimension', {
    palette: false,
    args: {
      type: 'object',
      required: ['kind', 'points', 'at'],
      properties: {
        kind: { type: 'string', enum: ['linear', 'radius', 'diameter', 'angle'] },
        /** linear: [[x1, y1], [x2, y2]]; radius / diameter: [[cx, cy]]; angle: corner, ray 1, ray 2. */
        points: { type: 'json' },
        /** Where it is placed: [x, y]. */
        at: { type: 'json' },
        r: { type: 'number', minimum: 0 },
      },
    },
  }),
  // Live Corners (prompt 045): without arguments the dialog
  EDIT('corners.set', 'Corners…', {
    args: {
      type: 'object',
      properties: {
        radius: { type: 'number', minimum: 0, maximum: 10000 },
        kind: { type: 'string', enum: ['round', 'inverted', 'chamfer'] },
      },
    },
  }),
  // view (legacy §4, §5, §9)
  VIEW('view.commandSidebar', 'Command Sidebar'),
  VIEW('view.hierarchy', 'Hierarchy'),
  VIEW('view.properties', 'Properties'),
  // width of a side panel (design 015 E10); without `width` the default
  VIEW('view.panelWidth', 'Side Panel Width', {
    palette: false,
    args: {
      type: 'object',
      required: ['panel'],
      properties: {
        panel: { type: 'string', enum: ['commands', 'hierarchy', 'properties'] },
        width: { type: 'integer', minimum: 0, maximum: 10000 },
      },
    },
  }),
  VIEW('view.rulers', 'Rulers'),
  VIEW('view.guides', 'Guides'),
  VIEW('view.background', 'Background'),
  VIEW('view.effects', 'Effects Preview (approximation)'),
  VIEW('view.crossCursor', 'Cross Cursor'),
  VIEW('view.handles', 'Show Handles'),
  VIEW('view.snapToGrid', 'Snap to Grid'),
  VIEW('view.magicSnap', 'Magic Snap'),
  VIEW('view.smartGuides', 'Smart Guides'),
  VIEW('view.zoomIn', 'Zoom In', { repeat: true }),
  VIEW('view.zoomOut', 'Zoom Out', { repeat: true }),
  VIEW('view.actualSize', 'Actual Size'),
  VIEW('view.zoomToFit', 'Zoom to Fit'),
  VIEW('view.centerCanvas', 'Center Canvas'),
  VIEW('view.zoomTo', 'Zoom to', {
    palette: false,
    args: {
      type: 'object',
      required: ['zoom'],
      properties: { zoom: { type: 'number', minimum: 0.25, maximum: 2 } },
    },
  }),
  VIEW('view.appearance.light', 'Appearance: Light'),
  VIEW('view.appearance.dark', 'Appearance: Dark'),
  VIEW('view.mask.squircle', 'Platform Mask: iOS / macOS'),
  VIEW('view.mask.circle', 'Platform Mask: watchOS'),
  VIEW('view.mask.none', 'Platform Mask: None'),
  // selection and snapping (design 007 E4, E13)
  VIEW('view.selectionMode.point', 'Selection Mode: Point'),
  VIEW('view.selectionMode.boxed', 'Selection Mode: Boxed'),
  VIEW('view.selectionMode.none', 'Selection Mode: None'),
  VIEW('view.gridOrigin.worldZero', 'Grid Origin: World Zero'),
  VIEW('view.gridOrigin.svgCenter', 'Grid Origin: SVG Center'),
  // canvas keys (not in menus)
  VIEW('canvas.panHold', 'Pan (hold)', { context: 'canvas', hold: true, palette: false }),
  // canvas editing (design 007 E12, E15): Esc and Delete fall through when there is nothing to do
  EDIT('canvas.escape', 'Cancel / Leave Group', { context: 'canvas', palette: false }),
  EDIT('canvas.deletePoint', 'Delete Point', { context: 'canvas' }),
  // freehand tool (design 013 E4): only while the tool is on
  ADD('freehand.toggleClosed', 'Freehand: Open / Closed', { context: 'canvas' }),
  // add (legacy §8; prompts 008, 013) – with serialisable arguments (design 008 E6)
  ADD('add.iconGroup', 'Group (SVG)'),
  ADD('add.container', 'Container <g>', { args: shapeArgsSpec('container') }),
  ADD('add.circle', 'Circle at Center', { args: shapeArgsSpec('circle') }),
  ADD('add.ellipse', 'Ellipse', { args: shapeArgsSpec('ellipse') }),
  ADD('add.rect', 'Rectangle at Center', { args: shapeArgsSpec('rect') }),
  ADD('add.path', 'Path', { args: shapeArgsSpec('path') }),
  ADD('add.freehand', 'Freehand', { args: FREEHAND_ARGS }),
  ADD('add.line', 'Line at Center', { args: shapeArgsSpec('line') }),
  ADD('add.polyline', 'Polyline', { args: shapeArgsSpec('polyline') }),
  ADD('add.polygon', 'Polygon at Center', { args: shapeArgsSpec('polygon') }),
  ADD('add.text', 'Text', { args: shapeArgsSpec('text') }),
  ADD('add.textToPath', 'Text to Path…', { args: TEXT_PATH_ARGS }),
  ADD('add.symbol', 'Symbol…', { args: SYMBOL_ARGS }),
  ADD('add.svgSnippet', 'SVG Snippet…', { args: SNIPPET_ARGS }),
  ADD('add.image', 'Image…', { args: IMAGE_ARGS }),
  // sketch tools like Fusion (prompt 019): without arguments the mouse tool on/off
  ADD('sketch.line', 'Line', { args: SKETCH_ARGS }),
  ADD('sketch.midpointLine', 'Midpoint Line', { args: SKETCH_ARGS }),
  ADD('sketch.rect2p', '2-Point Rectangle', { args: SKETCH_ARGS }),
  ADD('sketch.rect3p', '3-Point Rectangle', { args: SKETCH_ARGS }),
  ADD('sketch.rectCenter', 'Center Rectangle', { args: SKETCH_ARGS }),
  ADD('sketch.circleCenter', 'Center Diameter Circle', { args: SKETCH_ARGS }),
  ADD('sketch.circle2p', '2-Point Circle', { args: SKETCH_ARGS }),
  ADD('sketch.circle3p', '3-Point Circle', { args: SKETCH_ARGS }),
  ADD('sketch.circle2t', '2-Tangent Circle', { args: SKETCH_ARGS }),
  ADD('sketch.circle3t', '3-Tangent Circle', { args: SKETCH_ARGS }),
  ADD('sketch.arc3p', '3-Point Arc', { args: SKETCH_ARGS }),
  ADD('sketch.arcCenter', 'Center Point Arc', { args: SKETCH_ARGS }),
  ADD('sketch.arcTangent', 'Tangent Arc', { args: SKETCH_ARGS }),
  ADD('sketch.polygonCircumscribed', 'Circumscribed Polygon', { args: SKETCH_ARGS }),
  ADD('sketch.polygonInscribed', 'Inscribed Polygon', { args: SKETCH_ARGS }),
  ADD('sketch.polygonEdge', 'Edge Polygon', { args: SKETCH_ARGS }),
  // drawn with one drag like VectorCraft (prompt 041); a click asks for the size
  ADD('sketch.dragRect', 'Rectangle Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragEllipse', 'Ellipse Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragPolygon', 'Polygon Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragLine', 'Line Segment Tool', { args: SKETCH_ARGS }),
  // more shapes with one drag (prompt 044)
  ADD('sketch.dragRoundRect', 'Rounded Rectangle Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragStar', 'Star Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragSpiral', 'Spiral Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragRectGrid', 'Rectangular Grid Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragPolarGrid', 'Polar Grid Tool', { args: SKETCH_ARGS }),
  ADD('sketch.dragArc', 'Arc Tool', { args: SKETCH_ARGS }),
  // only while dragging one of them (the "drawing" keys come before the canvas's)
  // the pen (prompt 042): click / drag points; Enter ends
  ADD('pen.tool', 'Pen', { args: PEN_ARGS }),
  ADD('pen.finish', 'Finish Path', { context: 'drawing', palette: false }),
  // the curvature tool (prompt 043): the curve runs through the clicks; edits the selected path
  ADD('curvature.tool', 'Curvature', { args: CURVATURE_ARGS }),
  ADD('curvature.removePoint', 'Remove Point (Curvature)', { context: 'drawing', palette: false }),
  ADD('sketch.sidesUp', 'Polygon: One Side More', {
    context: 'drawing',
    repeat: true,
    palette: false,
  }),
  ADD('sketch.sidesDown', 'Polygon: One Side Less', {
    context: 'drawing',
    repeat: true,
    palette: false,
  }),
  ADD('sketch.moveHold', 'Move the Shape Being Drawn (hold)', {
    context: 'drawing',
    hold: true,
    palette: false,
  }),
  // arrange (legacy §7.2, §7.3; prompt 006)
  ARRANGE('arrange.bringToFront', 'Bring to Front', TEXT),
  ARRANGE('arrange.sendToBack', 'Send to Back', TEXT),
  ARRANGE('arrange.moveUp', 'Move Up', { context: 'hierarchy', repeat: true }),
  ARRANGE('arrange.moveDown', 'Move Down', { context: 'hierarchy', repeat: true }),
  ARRANGE('arrange.moveInto', 'Move Into Group', { context: 'hierarchy' }),
  ARRANGE('arrange.moveOut', 'Move Out of Group', { context: 'hierarchy' }),
  ...NUDGES.map(([id, label]) =>
    ARRANGE(id, label, { context: 'canvas', repeat: true, palette: false }),
  ),
  // move the selection by a document delta (AI, tests; design 007 E12)
  ARRANGE('arrange.moveBy', 'Move By', {
    palette: false,
    args: {
      type: 'object',
      required: ['dx', 'dy'],
      properties: {
        dx: { type: 'number', minimum: -10000, maximum: 10000 },
        dy: { type: 'number', minimum: -10000, maximum: 10000 },
      },
    },
  }),
  ARRANGE('arrange.group', 'Group <g>'),
  ARRANGE('arrange.ungroup', 'Ungroup'),
  ARRANGE('arrange.align.left', 'Align Left'),
  ARRANGE('arrange.align.centerH', 'Align Centers Horizontally'),
  ARRANGE('arrange.align.right', 'Align Right'),
  ARRANGE('arrange.align.top', 'Align Top'),
  ARRANGE('arrange.align.middle', 'Align Centers Vertically'),
  ARRANGE('arrange.align.bottom', 'Align Bottom'),
  // clip paths (design 014 E14)
  ARRANGE('clip.create', 'Create Clip Path', { args: CLIP_CREATE_ARGS }),
  ARRANGE('clip.assign', 'Assign Clip Path', { palette: false, args: CLIP_ASSIGN_ARGS }),
  ARRANGE('clip.edit', 'Edit Clip Path', { args: CLIP_TARGET_ARGS }),
  ARRANGE('clip.done', 'Finish Editing Clip Path'),
  ARRANGE('clip.remove', 'Remove Clip Path…', { args: CLIP_REMOVE_ARGS }),
  ARRANGE('clip.setUnits', 'Clip Path Units', { palette: false, args: CLIP_UNITS_ARGS }),
  // the tree (APG tree pattern, design 006 E5)
  TREE('hierarchy.next', 'Next Row'),
  TREE('hierarchy.prev', 'Previous Row'),
  TREE('hierarchy.first', 'First Row'),
  TREE('hierarchy.last', 'Last Row'),
  TREE('hierarchy.expand', 'Expand or Go to Child'),
  TREE('hierarchy.collapse', 'Collapse or Go to Parent'),
  TREE('hierarchy.extendNext', 'Extend Selection Down'),
  TREE('hierarchy.extendPrev', 'Extend Selection Up'),
  TREE('hierarchy.extendFirst', 'Extend Selection to First'),
  TREE('hierarchy.extendLast', 'Extend Selection to Last'),
  TREE('hierarchy.focusNext', 'Move Focus Down'),
  TREE('hierarchy.focusPrev', 'Move Focus Up'),
  TREE('hierarchy.select', 'Select Row'),
  TREE('hierarchy.toggleSelect', 'Add or Remove Row'),
  TREE('hierarchy.menu', 'Row Menu'),
  // help
  HELP('app.shortcuts', 'Keyboard Shortcuts'),
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function actionDef(id: string): ActionDef | undefined {
  return BY_ID.get(id);
}
