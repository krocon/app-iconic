import { translatable } from '../../core/i18n/i18n';

/** Texts of the Align section (prompt 054). English is the source, German beside it. */
const EN = {
  section: 'Align',
  alignTo: 'Align to',
  to: { selection: 'Selection', canvas: 'Canvas', key: 'Key object' },
  distribute: 'Distribute',
  spacing: 'Spacing',
  spaceH: 'Distribute horizontally at this spacing',
  spaceV: 'Distribute vertically at this spacing',
  keyHint: 'Key object: the element selected last.',
} as const;

export const ALIGN_TEXTS = translatable('align', EN, {
  de: {
    section: 'Ausrichten',
    alignTo: 'Ausrichten an',
    to: { selection: 'Auswahl', canvas: 'Leinwand', key: 'Basisobjekt' },
    distribute: 'Verteilen',
    spacing: 'Abstand',
    spaceH: 'Horizontal mit diesem Abstand verteilen',
    spaceV: 'Vertikal mit diesem Abstand verteilen',
    keyHint: 'Basisobjekt: das zuletzt ausgewählte Element.',
  },
});
