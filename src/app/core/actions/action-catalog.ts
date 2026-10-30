import { ArgsSpec } from './action-args';
import { IMAGE_ARGS, shapeArgsSpec, SNIPPET_ARGS } from './add-action-args';
import { CONSTRAINT_ADD_ARGS, CONSTRAINT_TOOL_ARGS } from './constraint-action-args';
import { EXPORT_ARGS } from './export-action-args';
import {
  GRADIENT_ADD_STOP_ARGS,
  GRADIENT_CREATE_ARGS,
  GRADIENT_PAINT_ARGS,
  GRADIENT_REMOVE_STOP_ARGS,
  GRADIENT_SET_ARGS,
  GRADIENT_SET_STOP_ARGS,
} from './gradient-action-args';
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

/** Align to (prompt 054): the selection's box (default: the current choice), the canvas or the key object. */
const ALIGN_ARGS: ArgsSpec = {
  type: 'object',
  properties: { to: { type: 'string', enum: ['selection', 'canvas', 'key'] } },
};

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
  // the selection tools (prompt 061): end every tool; Boxed / Point selection mode
  EDIT('tool.select', 'Selection Tool'),
  EDIT('tool.direct', 'Direct Selection Tool'),
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
  // Trim and Extend like Fusion 360 (prompt 050)
  EDIT('trim.tool', 'Trim'),
  EDIT('extend.tool', 'Extend'),
  EDIT('trim.at', 'Trim at Point', {
    palette: false,
    args: {
      type: 'object',
      required: ['x', 'y'],
      properties: { x: { type: 'number' }, y: { type: 'number' } },
    },
  }),
  EDIT('extend.at', 'Extend at Point', {
    palette: false,
    args: {
      type: 'object',
      required: ['x', 'y'],
      properties: { x: { type: 'number' }, y: { type: 'number' } },
    },
  }),
  // Fillet and Chamfer between outlines (prompt 051)
  EDIT('fillet.tool', 'Fillet'),
  EDIT('chamfer.tool', 'Chamfer'),
  EDIT('fillet.at', 'Fillet / Chamfer at Points', {
    palette: false,
    args: {
      type: 'object',
      required: ['a', 'radius'],
      properties: {
        kind: { type: 'string', enum: ['fillet', 'chamfer'] },
        /** {x, y} on the first side (the part that stays). */
        a: { type: 'json' },
        /** {x, y} on the second side; without it the corner of one path at `a`. */
        b: { type: 'json' },
        radius: { type: 'number', minimum: 0 },
      },
    },
  }),
  EDIT('path.addAnchor', 'Add Anchor Point Tool'),
  EDIT('path.deleteAnchor', 'Delete Anchor Point Tool'),
  EDIT('path.anchorPoint', 'Anchor Point Tool'),
  EDIT('path.scissors', 'Scissors Tool'),
  EDIT('path.smooth', 'Smooth Tool'),
  EDIT('path.eraser', 'Path Eraser Tool'),
  // Offset Path and Outline Stroke (prompt 052)
  EDIT('path.offset', 'Offset Path…', {
    args: {
      type: 'object',
      properties: {
        /** > 0 grows, < 0 shrinks (document units); without it the dialog. */
        distance: { type: 'number' },
        join: { type: 'string', enum: ['miter', 'round', 'bevel'] },
        replace: { type: 'boolean' },
      },
    },
  }),
  EDIT('path.outlineStroke', 'Outline Stroke'),
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
  // patterns, mirror, clone, construction lines like Fusion 360 (prompt 049)
  ADD('pattern.circular', 'Circular Pattern…', {
    args: {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 2, maximum: 1001 },
        /** Total angle in degrees; 360 = full turn. */
        angle: { type: 'number', minimum: -360, maximum: 360 },
        /** Centre [x, y] in document units; default: centre of the selection. */
        center: { type: 'json' },
      },
    },
  }),
  ADD('pattern.rectangular', 'Rectangular Pattern…', {
    args: {
      type: 'object',
      properties: {
        columns: { type: 'integer', minimum: 1, maximum: 1001 },
        rows: { type: 'integer', minimum: 1, maximum: 1001 },
        dx: { type: 'number' },
        dy: { type: 'number' },
      },
    },
  }),
  ADD('pattern.mirror', 'Mirror', {
    args: {
      type: 'object',
      properties: {
        /** Two points [x, y] of the mirror line (document units). */
        a: { type: 'json' },
        b: { type: 'json' },
      },
    },
  }),
  ADD('pattern.centerHere', 'Circular Pattern: Centre of the Selection', {
    context: 'canvas',
    palette: false,
  }),
  EDIT('edit.cloneLinked', 'Clone (Linked)'),
  EDIT('edit.toggleConstruction', 'Construction Line'),
  // draw as construction (prompt 058)
  ADD('sketch.toggleConstructionMode', 'Draw as Construction'),
  // live fills (prompt 060)
  ADD('fill.tool', 'Fill Tool'),
  ADD('fill.at', 'Fill Area at Point', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        color: { type: 'string', maxLength: 64 },
      },
      required: ['x', 'y'],
    },
  }),
  ADD('fill.across', 'Fill Areas as One', {
    palette: false,
    args: {
      type: 'object',
      properties: { points: { type: 'json' }, color: { type: 'string', maxLength: 64 } },
      required: ['points'],
    },
  }),
  EDIT('fill.remove', 'Remove Fill at Point', {
    palette: false,
    args: {
      type: 'object',
      properties: { x: { type: 'number' }, y: { type: 'number' } },
      required: ['x', 'y'],
    },
  }),
  ADD('fill.color', 'Fill Colour', {
    palette: false,
    args: {
      type: 'object',
      properties: { color: { type: 'string', maxLength: 64 } },
      required: ['color'],
    },
  }),
  EDIT('fill.detach', 'Detach Fill'),
  // constraints and driving dimensions (prompt 059)
  ADD('constraint.tool', 'Constraint Tool', { args: CONSTRAINT_TOOL_ARGS }),
  ADD('constraint.add', 'Add Constraint', { palette: false, args: CONSTRAINT_ADD_ARGS }),
  EDIT('constraint.remove', 'Remove Constraint', {
    args: {
      type: 'object',
      properties: {
        asset: { type: 'string', maxLength: 256 },
        id: { type: 'string', maxLength: 40 },
      },
    },
  }),
  EDIT('constraint.setValue', 'Change Dimension Value', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        asset: { type: 'string', maxLength: 256 },
        id: { type: 'string', maxLength: 40 },
        value: { type: 'number' },
      },
      required: ['asset', 'id', 'value'],
    },
  }),
  EDIT('constraint.solve', 'Solve Constraints', {
    args: { type: 'object', properties: { asset: { type: 'string', maxLength: 256 } } },
  }),
  VIEW('view.constraints', 'Constraints'),
  // gradient editor (prompt 032)
  EDIT('gradient.create', 'Create Gradient', { args: GRADIENT_CREATE_ARGS }),
  EDIT('gradient.set', 'Change Gradient', { palette: false, args: GRADIENT_SET_ARGS }),
  EDIT('gradient.addStop', 'Add Gradient Stop', { palette: false, args: GRADIENT_ADD_STOP_ARGS }),
  EDIT('gradient.setStop', 'Change Gradient Stop', {
    palette: false,
    args: GRADIENT_SET_STOP_ARGS,
  }),
  EDIT('gradient.removeStop', 'Remove Gradient Stop', {
    palette: false,
    args: GRADIENT_REMOVE_STOP_ARGS,
  }),
  EDIT('gradient.editOnCanvas', 'Edit Gradient on Canvas'),
  EDIT('gradient.makeUnique', 'Make Gradient Unique', { args: GRADIENT_PAINT_ARGS }),
  // lock and isolate (prompt 055)
  EDIT('edit.toggleLock', 'Lock / Unlock', {
    args: { type: 'object', properties: { nodes: { type: 'json' } } },
  }),
  EDIT('edit.unlockAll', 'Unlock All'),
  EDIT('edit.isolate', 'Isolate Group'),
  VIEW('view.constructionLines', 'Construction Lines'),
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
  ADD('guide.add', 'Add Guide', {
    palette: false,
    args: {
      type: 'object',
      required: ['axis', 'at'],
      properties: {
        axis: { type: 'string', enum: ['horizontal', 'vertical'] },
        /** y of a horizontal, x of a vertical guide (document units). */
        at: { type: 'number' },
      },
    },
  }),
  // small sizes and pixel grid (prompt 057)
  VIEW('view.smallPreview', 'Small Sizes Preview'),
  VIEW('view.pixelGrid.off', 'Pixel Grid: Off'),
  VIEW('view.pixelGrid.16', 'Pixel Grid: 16 px'),
  VIEW('view.pixelGrid.32', 'Pixel Grid: 32 px'),
  VIEW('view.pixelGrid.64', 'Pixel Grid: 64 px'),
  VIEW('view.pixelGrid.128', 'Pixel Grid: 128 px'),
  ARRANGE('arrange.alignToPixels', 'Align to Pixel Grid'),
  VIEW('view.guideTemplate.apple', 'Icon Grid: Apple'),
  VIEW('view.guideTemplate.material', 'Icon Grid: Material Keylines'),
  VIEW('view.guideTemplate.grid', 'Icon Grid: Even Grid'),
  VIEW('view.guideDivisions', 'Icon Grid: Divisions', {
    palette: false,
    args: {
      type: 'object',
      required: ['divisions'],
      properties: { divisions: { type: 'integer', minimum: 2, maximum: 64 } },
    },
  }),
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
  ARRANGE('arrange.align.left', 'Align Left', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.centerH', 'Align Centers Horizontally', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.right', 'Align Right', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.top', 'Align Top', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.middle', 'Align Centers Vertically', { args: ALIGN_ARGS }),
  ARRANGE('arrange.align.bottom', 'Align Bottom', { args: ALIGN_ARGS }),
  // align to, distribute (prompt 054)
  ARRANGE('arrange.alignTo.selection', 'Align to Selection'),
  ARRANGE('arrange.alignTo.canvas', 'Align to Canvas'),
  ARRANGE('arrange.alignTo.key', 'Align to Key Object'),
  ARRANGE('arrange.distribute.horizontalCenters', 'Distribute Horizontal Centres'),
  ARRANGE('arrange.distribute.verticalCenters', 'Distribute Vertical Centres'),
  ARRANGE('arrange.distribute.horizontalGaps', 'Distribute Horizontal Spacing'),
  ARRANGE('arrange.distribute.verticalGaps', 'Distribute Vertical Spacing'),
  ARRANGE('arrange.distribute.spacing', 'Distribute at Fixed Spacing', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        axis: { type: 'string', enum: ['horizontal', 'vertical'] },
        gap: { type: 'number' },
      },
    },
  }),
  // Transform with a pivot and numbers (prompt 053)
  ARRANGE('transform.rotate', 'Rotate Tool'),
  ARRANGE('transform.scale', 'Scale Tool'),
  ARRANGE('transform.reflect', 'Reflect Tool'),
  ARRANGE('transform.dialog', 'Transform…'),
  ARRANGE('transform.apply', 'Transform with Values', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        dx: { type: 'number' },
        dy: { type: 'number' },
        /** Degrees, clockwise on screen. */
        rotate: { type: 'number' },
        /** Factors (1 = 100 %). */
        sx: { type: 'number' },
        sy: { type: 'number' },
        reflect: { type: 'string', enum: ['none', 'horizontal', 'vertical'] },
        /** [x, y] in document units or one of tl t tr l c r bl b br (default c). */
        pivot: { type: 'json' },
        each: { type: 'boolean' },
        copy: { type: 'boolean' },
      },
    },
  }),
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
