import { translatable } from '../../core/i18n/i18n';

/** Texts of the recovery offer (prompt 083). English is the source, German beside it. */
const EN = {
  title: 'Recover Unsaved Documents',
  intro:
    'AppIconic did not quit normally. These documents had unsaved changes – restore them to keep working, or discard them.',
  none: 'There are no unsaved documents to recover.',
  untitled: 'Untitled',
  unsavedLocation: 'Never saved',
  savedAt: (when: string) => `Last copy ${when}`,
  restore: 'Restore',
  restoreLabel: (name: string) => `Restore ${name}`,
  discard: 'Discard',
  discardLabel: (name: string) => `Discard ${name}`,
  later: 'Later',
  laterHint: 'Later: they stay for the next start and in File › Recover Unsaved Documents…',
  oneWindow: 'A restored document opens in this window. For another one, open a new window first.',
} as const;

export const RECOVERY_TEXTS = translatable('recovery', EN, {
  de: {
    title: 'Ungesicherte Dokumente wiederherstellen',
    intro:
      'AppIconic wurde nicht normal beendet. Diese Dokumente hatten ungesicherte Änderungen – stellen Sie sie wieder her, um weiterzuarbeiten, oder verwerfen Sie sie.',
    none: 'Es gibt keine ungesicherten Dokumente zum Wiederherstellen.',
    untitled: 'Unbenannt',
    unsavedLocation: 'Nie gesichert',
    savedAt: (when: string) => `Letzte Kopie ${when}`,
    restore: 'Wiederherstellen',
    restoreLabel: (name: string) => `${name} wiederherstellen`,
    discard: 'Verwerfen',
    discardLabel: (name: string) => `${name} verwerfen`,
    later: 'Später',
    laterHint:
      'Später: Sie bleiben für den nächsten Start und unter Ablage › Ungesicherte Dokumente wiederherstellen…',
    oneWindow:
      'Ein wiederhergestelltes Dokument öffnet sich in diesem Fenster. Für ein weiteres zuerst ein neues Fenster öffnen.',
  },
});
