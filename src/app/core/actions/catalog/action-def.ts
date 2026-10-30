import { ArgsSpec } from '../action-args';

/** The types of the action catalogue and the helpers its parts share (prompt 033: split by area). */

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
export const APPEARANCE_ARG = { type: 'string', enum: ['default', 'dark', 'tinted'] } as const;
export const INDEX = { type: 'integer', minimum: 0 } as const;
/** Group / layer of an icon property; none = the icon itself. */
export const TARGET_ARGS = { group: INDEX, layer: INDEX } as const;

/** Align to (prompt 054): the selection's box (default: the current choice), the canvas or the key object. */
export const ALIGN_ARGS: ArgsSpec = {
  type: 'object',
  properties: { to: { type: 'string', enum: ['selection', 'canvas', 'key'] } },
};

/** Recently used files reachable from the menu ("Open Recent ›"). */
export const MAX_RECENT_ACTIONS = 10;

export type Extra = Partial<Omit<ActionDef, 'id' | 'label' | 'group'>>;

function group(g: ActionGroup) {
  return (id: string, label: string, extra: Extra = {}): ActionDef => ({
    id,
    label,
    context: 'global',
    group: g,
    ...extra,
  });
}

export const APP = group('app');
export const FILE = group('file');
export const EDIT = group('edit');
export const VIEW = group('view');
export const ADD = group('add');
export const ARRANGE = group('arrange');
export const HELP = group('help');
/** Keys of the tree (design 006 E5): context `hierarchy`, not in the palette. */
export const TREE = (id: string, label: string): ActionDef => ({
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
export const TEXT: Extra = { nativeInText: true };
