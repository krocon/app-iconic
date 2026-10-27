import { SectionId } from './property-spec';

/** Texts of the properties panel (design 009 E9). English is the source (German: prompt 015). */
export const PROPERTIES_TEXTS = {
  nothingSelected: 'Nothing selected',
  nothingSelectedHint: 'Select an element in the hierarchy or on the canvas.',
  iconItems: 'Icon, group and layer properties come with the icon inspector.',
  items: (n: number) => `${n} items selected`,
  mixed: 'mixed',
  reset: (label: string) => `Reset ${label}`,
  resetAll: 'Reset All…',
  resetAllTitle: 'Reset all properties?',
  resetAllMessage: (n: number) =>
    n === 1
      ? 'Every property that can be reset is removed from the selected element.'
      : `Every property that can be reset is removed from the ${n} selected elements.`,
  resetAllButton: 'Reset All',
  cancelButton: 'Cancel',
  constrain: 'Constrain proportions',
  inherited: 'inherited',
  hasChildren: 'Contains child elements – edit with “Edit SVG…”',
  sections: {
    geometry: 'Geometry',
    appearance: 'Appearance',
    stroke: 'Stroke',
    text: 'Text',
    transform: 'Transform',
    advanced: 'Advanced',
  } satisfies Record<SectionId, string>,
  // transform list (design 009 E7, legacy TransformSection)
  transformRaw: 'Transform Attribute',
  transformInvalid: 'Not a valid transform list.',
  transformMixed: 'The selected elements have different transforms.',
  transformEmpty: 'No transform applied – use Add to create one.',
  transformAdd: 'Add…',
  transformOrder: 'Drag to reorder (top applies first)',
  usePivot: 'Use pivot',
  keepRatio: 'Keep ratio',
  moveUp: 'Move step up',
  moveDown: 'Move step down',
  removeStep: 'Remove step',
  dragStep: 'Drag to reorder, Alt+↑/↓ to move',
  steps: {
    translate: 'Translate',
    scale: 'Scale',
    rotate: 'Rotate',
    skewX: 'Skew X',
    skewY: 'Skew Y',
    matrix: 'Matrix',
  },
} as const;
