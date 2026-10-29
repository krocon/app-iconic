import { translatable } from '../../core/i18n/i18n';

/** Texts of Pathfinder, Shape Builder and the cuts (prompt 047). English is the source. */
const EN = {
  empty: 'Nothing is left of the shapes.',
  needTwo: 'Select at least two shapes.',
  needOne: 'Select a shape first.',
  loading: 'Preparing the shapes…',
  hints: {
    shapeBuilder: 'Shape Builder: drag across regions to merge them, Alt + drag deletes them',
    knife: 'Knife: drag through the selected shapes to cut them',
    lineCut: 'Line Cut: drag a straight line through the selected shapes',
    rectCut: 'Rectangle Cut: drag a rectangle that splits the selected shapes',
  },
  escEnds: 'Esc ends',
} as const;

export const PATHFINDER_TEXTS = translatable('pathfinder', EN, {
  de: {
    empty: 'Von den Formen bleibt nichts übrig.',
    needTwo: 'Mindestens zwei Formen auswählen.',
    needOne: 'Zuerst eine Form auswählen.',
    loading: 'Formen werden vorbereitet …',
    hints: {
      shapeBuilder:
        'Formerstellung: über Teilflächen ziehen vereinigt sie, Alt + Ziehen löscht sie',
      knife: 'Messer: durch die ausgewählten Formen ziehen, um sie zu schneiden',
      lineCut: 'Linienschnitt: eine gerade Linie durch die ausgewählten Formen ziehen',
      rectCut: 'Rechteckschnitt: ein Rechteck aufziehen, das die ausgewählten Formen teilt',
    },
    escEnds: 'Esc beendet',
  },
});
