import { DocumentNotice } from '../document/icon-document';

/**
 * Texts of the file actions (design 003). English is the source; German follows in prompt 015.
 * Menu texts and shortcuts come from the action catalogue (design 005).
 */
export const FILES_TEXTS = {
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
} as const;

const NOTICE_TEXTS: Record<DocumentNotice['code'], string> = {
  missing_asset: 'missing image',
  ignored_entry: 'ignored entry',
  unreadable_asset: 'unreadable image',
  unparsable_svg: 'SVG that cannot be edited',
  script: 'removed scripts',
  handler: 'removed event handlers',
  foreign_object: 'removed embedded HTML',
  external_ref: 'removed external references',
  style: 'removed external styles',
};

/** One line for the status bar: "logo.svg: removed scripts · gone.svg: missing image". */
export function describeNotices(notices: readonly DocumentNotice[]): string | null {
  if (!notices.length) return null;
  return notices.map((n) => `${n.name}: ${NOTICE_TEXTS[n.code]}`).join(' · ');
}
