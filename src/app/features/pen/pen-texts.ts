import { translatable } from '../../core/i18n/i18n';

/** Texts of the pen and curvature tools (prompts 042, 043). English is the source, German beside it. */
const EN = {
  pen: {
    start: 'Pen: click a corner, drag a smooth point · click the end of the selected path to go on',
    drawing:
      'Pen: click / drag the next point · first point closes · last point: corner · Alt breaks handles · Shift 45° · Enter ends',
  },
  curvature: {
    start:
      'Curvature: click points, the path curves through them · click a selected path to edit it',
    drawing:
      'Curvature: click the next point · Alt-click / double-click: corner ↔ smooth · first point closes · Backspace removes · Enter ends',
    editing:
      'Curvature: drag a point · click the path to add one · Alt-click / double-click: corner ↔ smooth · Backspace removes · Esc ends',
  },
  failed: 'The path could not be drawn.',
  escEnds: 'Esc ends',
} as const;

export const PEN_TEXTS = translatable('pen', EN, {
  de: {
    pen: {
      start:
        'Zeichenstift: Ecke klicken, glatten Punkt ziehen · Ende des ausgewählten Pfads klicken, um ihn fortzusetzen',
      drawing:
        'Zeichenstift: nächsten Punkt klicken / ziehen · erster Punkt schließt · letzter Punkt: Ecke · Alt bricht Griffe · Shift 45° · Enter beendet',
    },
    curvature: {
      start:
        'Kurvenzeichner: Punkte klicken, der Pfad krümmt sich hindurch · ausgewählten Pfad klicken, um ihn zu bearbeiten',
      drawing:
        'Kurvenzeichner: nächsten Punkt klicken · Alt-Klick / Doppelklick: Ecke ↔ glatt · erster Punkt schließt · Rücktaste entfernt · Enter beendet',
      editing:
        'Kurvenzeichner: Punkt ziehen · Pfad klicken fügt einen hinzu · Alt-Klick / Doppelklick: Ecke ↔ glatt · Rücktaste entfernt · Esc beendet',
    },
    failed: 'Der Pfad konnte nicht gezeichnet werden.',
    escEnds: 'Esc beendet',
  },
});
