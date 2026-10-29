import { translatable } from '../../core/i18n/i18n';

/**
 * Texts of the command sidebar and the "Add" functions (prompt 008). English is the source,
 * German beside it (015). Action titles come from the action catalogue (design 005).
 */
const EN = {
  search: 'Filter commands',
  searchPlaceholder: 'Filter…',
  listLabel: 'Add commands',
  noMatch: 'No command matches.',
  later: 'Coming in a later version',
  submenu: 'submenu',
  sections: {
    structure: 'Structure',
    shapes: 'Shapes',
    text: 'Text',
    import: 'Insert',
  },
  groups: {
    line: 'Line',
    rectangle: 'Rectangle',
    circle: 'Circle',
    arc: 'Arc',
    polygon: 'Polygon',
    ellipse: 'Ellipse',
    path: 'Path',
    editPath: 'Edit Path',
    combine: 'Combine & Cut',
    pattern: 'Pattern & Mirror',
    measure: 'Measure & Dimension',
    more: 'Spiral & Grids',
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

export const COMMANDS_TEXTS = translatable('commands', EN, {
  de: {
    search: 'Befehle filtern',
    searchPlaceholder: 'Filtern …',
    listLabel: 'Befehle zum Hinzufügen',
    noMatch: 'Kein Befehl passt.',
    later: 'Kommt in einer späteren Version',
    submenu: 'Untermenü',
    sections: {
      structure: 'Struktur',
      shapes: 'Formen',
      text: 'Text',
      import: 'Einfügen',
    },
    groups: {
      line: 'Linie',
      rectangle: 'Rechteck',
      circle: 'Kreis',
      arc: 'Bogen',
      polygon: 'Polygon',
      ellipse: 'Ellipse',
      path: 'Pfad',
      editPath: 'Pfad bearbeiten',
      combine: 'Kombinieren & Schneiden',
      pattern: 'Muster & Spiegeln',
      measure: 'Messen & Bemaßen',
      more: 'Spirale & Raster',
    },
    snippetTitle: 'SVG-Schnipsel',
    snippetLabel: 'SVG-Markup zum Anhängen einfügen',
    snippetPlaceholder: '<circle cx="512" cy="512" r="128" fill="#000"/>',
    snippetAdd: 'Hinzufügen',
    snippetCancel: 'Abbrechen',
    snippetErrors: {
      empty: 'Das Markup enthält kein Element zum Hinzufügen.',
      invalid: 'Das ist kein gültiges SVG-Markup.',
      tooLarge: 'Das Markup ist zu groß.',
    },
    imageFailed: 'Das Bild konnte nicht hinzugefügt werden.',
    addFailed: 'Das Element kann hier nicht hinzugefügt werden.',
  },
});
