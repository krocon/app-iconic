import { translatable } from '../../core/i18n/i18n';
import { DocumentNotice } from '../document/icon-document';

/**
 * Texts of the file actions (design 003). English is the source, German beside it (015).
 * Menu texts and shortcuts come from the action catalogue (design 005).
 */
const EN = {
  untitled: 'Untitled',
  edited: 'Edited',
  saveChangesTitle: (name: string) => `Do you want to save the changes to “${name}”?`,
  saveChangesMessage: 'Your changes will be lost if you don’t save them.',
  saveButton: 'Save',
  dontSaveButton: 'Don’t Save',
  cancelButton: 'Cancel',
  formatTitle: 'Save As',
  formatMessage:
    'Save the icon as a bundle folder (what Icon Composer writes) or as a single ZIP file?',
  formatBundle: 'Bundle',
  formatZip: 'ZIP',
  okButton: 'OK',
  openFailed: (name: string) => `“${name}” could not be opened.`,
  saveFailed: 'The icon could not be saved.',
  windowFailed: 'No new window could be opened.',
  importFailed: 'The SVG could not be imported.',
  invalidSvg: 'The file is not a valid SVG.',
  dismiss: 'Dismiss',
  notices: {
    missing_asset: 'missing image',
    ignored_entry: 'ignored entry',
    unreadable_asset: 'unreadable image',
    unparsable_svg: 'SVG that cannot be edited',
    script: 'removed scripts',
    handler: 'removed event handlers',
    foreign_object: 'removed embedded HTML',
    external_ref: 'removed external references',
    style: 'removed external styles',
  } satisfies Record<DocumentNotice['code'], string>,
} as const;

export const FILES_TEXTS = translatable('files', EN, {
  de: {
    untitled: 'Unbenannt',
    edited: 'Geändert',
    saveChangesTitle: (name: string) => `Sollen die Änderungen an „${name}“ gespeichert werden?`,
    saveChangesMessage: 'Deine Änderungen gehen verloren, wenn du sie nicht speicherst.',
    saveButton: 'Speichern',
    dontSaveButton: 'Nicht speichern',
    cancelButton: 'Abbrechen',
    formatTitle: 'Speichern unter',
    formatMessage:
      'Das Icon als Bundle-Ordner speichern (wie Icon Composer) oder als einzelne ZIP-Datei?',
    formatBundle: 'Bundle',
    formatZip: 'ZIP',
    okButton: 'OK',
    openFailed: (name: string) => `„${name}“ konnte nicht geöffnet werden.`,
    saveFailed: 'Das Icon konnte nicht gespeichert werden.',
    windowFailed: 'Es konnte kein neues Fenster geöffnet werden.',
    importFailed: 'Das SVG konnte nicht importiert werden.',
    invalidSvg: 'Die Datei ist kein gültiges SVG.',
    dismiss: 'Ausblenden',
    notices: {
      missing_asset: 'Bild fehlt',
      ignored_entry: 'Eintrag ignoriert',
      unreadable_asset: 'Bild nicht lesbar',
      unparsable_svg: 'SVG nicht bearbeitbar',
      script: 'Skripte entfernt',
      handler: 'Event-Handler entfernt',
      foreign_object: 'eingebettetes HTML entfernt',
      external_ref: 'externe Verweise entfernt',
      style: 'externe Styles entfernt',
    },
  },
});

/** One line for the status bar: "logo.svg: removed scripts · gone.svg: missing image". */
export function describeNotices(notices: readonly DocumentNotice[]): string | null {
  if (!notices.length) return null;
  return notices.map((n) => `${n.name}: ${FILES_TEXTS.notices[n.code]}`).join(' · ');
}
