import { ArgsSpec } from './action-args';

/**
 * Every function of the app as an action (design 005 E1; taken over from editlicious
 * `core/actions/action-catalog.ts`, there from comic-commander design 008): id, text, context and
 * menu group. Shortcuts live in the keymaps (`keymap.*.json`), handlers are registered by the
 * features (`ActionService`). Menus, the command palette, the keyboard – and the AI over MCP
 * (prompt 018) – all run actions by id. Entries whose function a later prompt brings stand here
 * already; without a handler they are disabled. Texts: English = source (German in prompt 015).
 */

/**
 * Where a shortcut is active (design 005 E4): `global` everywhere, `canvas` / `hierarchy` while
 * the focus is there (before `global`), `dialog` while a dialog is open (nothing else then).
 */
export type ActionContext = 'global' | 'canvas' | 'hierarchy' | 'dialog';

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

/** Clipboard and editing keys stay with text fields (design 005 E4/E7). */
const TEXT: Extra = { nativeInText: true };

export const ACTIONS: readonly ActionDef[] = [
  // app (macOS: About and Quit in the app menu)
  APP('app.palette', 'Command Palette…', { palette: false }),
  APP('app.about', 'About AppIconic'),
  APP('app.settings', 'Settings…'),
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
  FILE('file.exportSvg', 'Export SVG…'),
  FILE('file.exportPng', 'Export PNG…'),
  FILE('file.save', 'Save'),
  FILE('file.saveAs', 'Save As…'),
  FILE('file.close', 'Close'),
  // edit (legacy §4, §7.2, §12)
  EDIT('edit.undo', 'Undo', TEXT),
  EDIT('edit.redo', 'Redo', TEXT),
  EDIT('edit.cut', 'Cut', TEXT),
  EDIT('edit.copy', 'Copy', TEXT),
  EDIT('edit.paste', 'Paste', TEXT),
  EDIT('edit.duplicate', 'Duplicate'),
  EDIT('edit.delete', 'Delete', TEXT),
  EDIT('edit.selectAll', 'Select All', TEXT),
  EDIT('edit.deselect', 'Deselect'),
  EDIT('edit.runCommand', 'Run a document command', {
    palette: false,
    args: {
      type: 'object',
      required: ['command'],
      properties: { command: { type: 'json' } },
    },
  }),
  // view (legacy §4, §5, §9)
  VIEW('view.commandSidebar', 'Command Sidebar'),
  VIEW('view.hierarchy', 'Hierarchy'),
  VIEW('view.properties', 'Properties'),
  VIEW('view.rulers', 'Rulers'),
  VIEW('view.guides', 'Guides'),
  VIEW('view.background', 'Background'),
  VIEW('view.crossCursor', 'Cross Cursor'),
  VIEW('view.handles', 'Show Handles'),
  VIEW('view.snapToGrid', 'Snap to Grid'),
  VIEW('view.magicSnap', 'Magic Snap'),
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
  // canvas keys (not in menus)
  VIEW('canvas.panHold', 'Pan (hold)', { context: 'canvas', hold: true, palette: false }),
  // add (legacy §8; prompts 008, 013)
  ADD('add.iconGroup', 'Group (SVG)'),
  ADD('add.container', 'Container <g>'),
  ADD('add.circle', 'Circle'),
  ADD('add.ellipse', 'Ellipse'),
  ADD('add.rect', 'Rectangle'),
  ADD('add.path', 'Path'),
  ADD('add.freehand', 'Freehand'),
  ADD('add.line', 'Line'),
  ADD('add.polyline', 'Polyline'),
  ADD('add.polygon', 'Polygon'),
  ADD('add.text', 'Text'),
  ADD('add.textToPath', 'Text to Path…'),
  ADD('add.symbol', 'Symbol…'),
  ADD('add.svgSnippet', 'SVG Snippet…'),
  ADD('add.image', 'Image…'),
  // arrange (legacy §7.2, §7.3; prompt 006)
  ARRANGE('arrange.bringToFront', 'Bring to Front', TEXT),
  ARRANGE('arrange.sendToBack', 'Send to Back', TEXT),
  ARRANGE('arrange.group', 'Group <g>'),
  ARRANGE('arrange.ungroup', 'Ungroup'),
  ARRANGE('arrange.align.left', 'Align Left'),
  ARRANGE('arrange.align.centerH', 'Align Centers Horizontally'),
  ARRANGE('arrange.align.right', 'Align Right'),
  ARRANGE('arrange.align.top', 'Align Top'),
  ARRANGE('arrange.align.middle', 'Align Centers Vertically'),
  ARRANGE('arrange.align.bottom', 'Align Bottom'),
  // help
  HELP('app.shortcuts', 'Keyboard Shortcuts'),
];

const BY_ID = new Map(ACTIONS.map((a) => [a.id, a]));

export function actionDef(id: string): ActionDef | undefined {
  return BY_ID.get(id);
}
