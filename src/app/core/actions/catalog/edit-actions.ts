import { ActionDef, EDIT, TEXT, APPEARANCE_ARG, INDEX, TARGET_ARGS } from './action-def';
import { SYMBOL_DELETE_ARGS, SYMBOL_RENAME_ARGS, SYMBOL_SAVE_ARGS } from '../tool-action-args';

/** The actions of edit, selection tools, properties panel, box head and icon inspector (split from `action-catalog.ts` in prompt 033). */
export const EDIT_ACTIONS: readonly ActionDef[] = [
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
  // the own symbol library (prompt 084): save the selection, manage, folders
  EDIT('symbols.save', 'Save as Symbol…', { args: SYMBOL_SAVE_ARGS }),
  EDIT('symbols.rename', 'Rename Own Symbol', { args: SYMBOL_RENAME_ARGS }),
  EDIT('symbols.delete', 'Delete Own Symbol', { args: SYMBOL_DELETE_ARGS }),
  EDIT('symbols.import', 'Import Symbols from Folder…'),
  EDIT('symbols.export', 'Export My Symbols to Folder…'),
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
  // the context bar of the active tool (prompt 067)
  EDIT('tool.option', 'Set Tool Option', {
    palette: false,
    args: {
      type: 'object',
      required: ['key', 'value'],
      properties: { key: { type: 'string', maxLength: 32 }, value: { type: 'json' } },
    },
  }),
  EDIT('tool.done', 'End Tool'),
  // the canvas's context menu at the selection (prompt 070, ⇧F10 / context menu key)
  { id: 'canvas.menu', label: 'Context Menu', context: 'canvas', group: 'edit', palette: false },
  EDIT('tool.focusOptions', 'Go to Tool Options'),
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
  // the box head (prompt 062): position, size, rotation and flips in document units
  EDIT('properties.box', 'Set Position and Size', {
    palette: false,
    args: {
      type: 'object',
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number', minimum: 0 },
        height: { type: 'number', minimum: 0 },
        rotation: { type: 'number' },
        rotateBy: { type: 'number' },
        flipH: { type: 'boolean' },
        flipV: { type: 'boolean' },
        pivot: { type: 'string', enum: ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'] },
        lock: { type: 'boolean' },
      },
    },
  }),
  EDIT('properties.flipH', 'Flip Horizontal'),
  EDIT('properties.flipV', 'Flip Vertical'),
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
];
