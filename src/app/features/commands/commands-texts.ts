/**
 * Texts of the command sidebar and the "Add" functions (prompt 008). English is the source;
 * German follows in prompt 015. Action titles come from the action catalogue (design 005).
 */
export const COMMANDS_TEXTS = {
  search: 'Filter commands',
  searchPlaceholder: 'Filter…',
  listLabel: 'Add commands',
  noMatch: 'No command matches.',
  later: 'Coming in a later version',
  sections: {
    structure: 'Structure',
    shapes: 'Shapes',
    tools: 'Tools',
    import: 'Import',
  },
  snippetTitle: 'SVG Snippet',
  snippetLabel: 'Paste SVG markup to append',
  snippetPlaceholder: '<circle cx="512" cy="512" r="128" fill="#000"/>',
  snippetAdd: 'Add',
  snippetCancel: 'Cancel',
  snippetErrors: {
    empty: 'The markup contains no element to add.',
    invalid: 'This is not valid SVG markup.',
    tooLarge: 'The markup is too large.',
  },
  imageFailed: 'The image could not be added.',
  addFailed: 'The element could not be added here.',
} as const;
