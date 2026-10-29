import { translatable } from '../../core/i18n/i18n';

/** Texts of Measure and Dimension (prompt 048). English is the source, German beside it. */
const EN = {
  measure: {
    start: 'Measure: drag between two points',
    value: 'Distance {d} · Angle {a}° · Δx {dx} · Δy {dy}',
  },
  dimension: {
    start: 'Dimension: drag out from an edge, corner or circle – or click two points',
    place: 'Dimension: click to place',
    second: 'Dimension: click the second point',
  },
  escEnds: 'Esc ends',
  addFailed: 'The dimension could not be added.',
} as const;

export const DIMENSION_TEXTS = translatable('dimension', EN, {
  de: {
    measure: {
      start: 'Messen: zwischen zwei Punkten ziehen',
      value: 'Abstand {d} · Winkel {a}° · Δx {dx} · Δy {dy}',
    },
    dimension: {
      start:
        'Bemaßung: von einer Kante, Ecke oder einem Kreis herausziehen – oder zwei Punkte klicken',
      place: 'Bemaßung: zum Platzieren klicken',
      second: 'Bemaßung: zweiten Punkt klicken',
    },
    escEnds: 'Esc beendet',
    addFailed: 'Die Bemaßung kann nicht hinzugefügt werden.',
  },
});
