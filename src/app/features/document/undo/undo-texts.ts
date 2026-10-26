/**
 * Names of undoable actions (legacy §12 `UndoController`, plus the icon.json actions of the
 * rewrite). English is the source; German follows in prompt 015.
 */
export const UNDO_TEXTS = {
  undo: 'Undo',
  redo: 'Redo',
  // legacy §12
  changeFill: 'Change Fill',
  changeStroke: 'Change Stroke',
  changeStrokeWidth: 'Change Stroke Width',
  changeOpacity: 'Change Opacity',
  changeFontSize: 'Change Font Size',
  changeFontFamily: 'Change Font Family',
  changeFontWeight: 'Change Font Weight',
  changeText: 'Change Text',
  changeTransform: 'Change Transform',
  changeAttribute: 'Change Attribute',
  editSvgCode: 'Edit SVG Code',
  insertPoint: 'Insert Point',
  deletePoint: 'Delete Point',
  adjustPath: 'Adjust Path',
  moveNode: 'Move Node',
  reorderNode: 'Reorder Node',
  groupNodes: 'Group <g>',
  ungroup: 'Ungroup',
  clone: 'Clone',
  delete: 'Delete',
  toggleVisibility: 'Toggle Visibility',
  resetAllProperties: 'Reset All Properties',
  // rewrite (design 003)
  removeAttribute: 'Remove Attribute',
  insertNode: 'Insert Node',
  changeIconProperty: 'Change Icon Property',
  addGroup: 'Add Group',
  removeGroup: 'Remove Group',
  moveGroup: 'Move Group',
  addLayer: 'Add Layer',
  removeLayer: 'Remove Layer',
  addAsset: 'Add Asset',
  removeAsset: 'Remove Asset',
  importSvg: 'Import SVG',
  // hierarchy (design 006 E17)
  moveLayer: 'Move Layer',
  bringToFront: 'Bring to Front',
  sendToBack: 'Send to Back',
  paste: 'Paste',
  cut: 'Cut',
} as const;

/** Key of an action name (`label` of a command). */
export type UndoLabel = Exclude<keyof typeof UNDO_TEXTS, 'undo' | 'redo'>;
