import { translatable } from '../../core/i18n/i18n';

/** Texts of the window shell (English = source, German beside it; design 015 E13). */
const EN = {
  appName: 'AppIconic',
  tagline: 'Editor for Apple .icon app icons',
  commands: 'Commands',
  hierarchy: 'Hierarchy',
  properties: 'Properties',
  canvas: 'Canvas',
  noDocument: 'No document open',
  undo: 'Undo',
  save: 'Save',
  export: 'Export…',
  exportHint: 'Export SVG or PNG – File › Export',
  redo: 'Redo',
  resize: (panel: string) => `Resize ${panel}`,
  resizeHint: '←/→ change the width, double-click or Enter: default width',
} as const;

export const SHELL_TEXTS = translatable('shell', EN, {
  de: {
    appName: 'AppIconic',
    tagline: 'Editor für App-Icons im Apple-Format .icon',
    commands: 'Befehle',
    hierarchy: 'Hierarchie',
    properties: 'Eigenschaften',
    canvas: 'Arbeitsfläche',
    noDocument: 'Kein Dokument geöffnet',
    undo: 'Widerrufen',
    save: 'Speichern',
    export: 'Exportieren …',
    exportHint: 'Als SVG oder PNG exportieren – Ablage › Exportieren',
    redo: 'Wiederholen',
    resize: (panel: string) => `Breite von ${panel} ändern`,
    resizeHint: '←/→ ändern die Breite, Doppelklick oder Eingabe: Standardbreite',
  },
});
