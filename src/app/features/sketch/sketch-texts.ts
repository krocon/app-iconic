import { translatable } from '../../core/i18n/i18n';

/**
 * Texts of the sketch tools (prompt 019): status hints per step, the dimension fields, notices.
 * English is the source, German beside it (015). Tool names come from the action catalogue.
 */
const EN = {
  fields: {
    length: 'Length',
    angle: 'Angle',
    width: 'Width',
    height: 'Height',
    diameter: 'Diameter',
    radius: 'Radius',
    start: 'Start angle',
    sweep: 'Sweep',
  },
  fixed: (label: string) => `${label} (fixed)`,
  fieldsLabel: 'Dimensions',
  fieldsHint: 'Type a value · Tab next field · Enter places · Esc cancels',
  escEnds: 'Esc ends',
  steps: {
    line: ['Line: click the start', 'Line: click the end or type length and angle'],
    midpointLine: [
      'Midpoint Line: click the middle',
      'Midpoint Line: click an end or type length and angle',
    ],
    rect2p: [
      '2-Point Rectangle: click a corner',
      '2-Point Rectangle: click the opposite corner or type width and height',
    ],
    rect3p: [
      '3-Point Rectangle: click the first corner',
      '3-Point Rectangle: click the second corner or type length and angle',
      '3-Point Rectangle: click the side or type the height',
    ],
    rectCenter: [
      'Center Rectangle: click the centre',
      'Center Rectangle: click a corner or type width and height',
    ],
    circleCenter: [
      'Center Diameter Circle: click the centre',
      'Center Diameter Circle: click a point on the circle or type the diameter',
    ],
    circle2p: [
      '2-Point Circle: click a point',
      '2-Point Circle: click the opposite point or type the diameter',
    ],
    circle3p: [
      '3-Point Circle: click the first point',
      '3-Point Circle: click the second point',
      '3-Point Circle: click the third point',
    ],
    circle2t: [
      '2-Tangent Circle: click the first line or circle',
      '2-Tangent Circle: click the second line or circle',
      '2-Tangent Circle: click a point of the circle or type the diameter',
    ],
    circle3t: [
      '3-Tangent Circle: click the first line or circle',
      '3-Tangent Circle: click the second line or circle',
      '3-Tangent Circle: click the third line or circle',
      '3-Tangent Circle: move into the circle you want and click',
    ],
    arc3p: [
      '3-Point Arc: click the start',
      '3-Point Arc: click the end',
      '3-Point Arc: click a point on the arc or type the radius',
    ],
    arcCenter: [
      'Center Point Arc: click the centre',
      'Center Point Arc: click the start or type radius and start angle',
      'Center Point Arc: click the end or type the sweep',
    ],
    arcTangent: [
      'Tangent Arc: click the end of a line or arc',
      'Tangent Arc: click the end or type radius and sweep',
    ],
  },
  failed: 'The shape could not be drawn.',
  noTarget: 'There is no edge, circle or line end at that point.',
  noSolution: 'No circle touches these.',
} as const;

export const SKETCH_TEXTS = translatable('sketch', EN, {
  de: {
    fields: {
      length: 'Länge',
      angle: 'Winkel',
      width: 'Breite',
      height: 'Höhe',
      diameter: 'Durchmesser',
      radius: 'Radius',
      start: 'Startwinkel',
      sweep: 'Bogenwinkel',
    },
    fixed: (label: string) => `${label} (fest)`,
    fieldsLabel: 'Maße',
    fieldsHint: 'Wert tippen · Tab nächstes Feld · Enter setzt · Esc bricht ab',
    escEnds: 'Esc beendet',
    steps: {
      line: ['Linie: Start klicken', 'Linie: Ende klicken oder Länge und Winkel tippen'],
      midpointLine: [
        'Mittelpunktlinie: Mitte klicken',
        'Mittelpunktlinie: ein Ende klicken oder Länge und Winkel tippen',
      ],
      rect2p: [
        'Rechteck über 2 Punkte: Ecke klicken',
        'Rechteck über 2 Punkte: Gegenecke klicken oder Breite und Höhe tippen',
      ],
      rect3p: [
        'Rechteck über 3 Punkte: erste Ecke klicken',
        'Rechteck über 3 Punkte: zweite Ecke klicken oder Länge und Winkel tippen',
        'Rechteck über 3 Punkte: Seite klicken oder Höhe tippen',
      ],
      rectCenter: [
        'Rechteck vom Mittelpunkt: Mitte klicken',
        'Rechteck vom Mittelpunkt: Ecke klicken oder Breite und Höhe tippen',
      ],
      circleCenter: [
        'Kreis Mittelpunkt + Durchmesser: Mitte klicken',
        'Kreis Mittelpunkt + Durchmesser: Punkt auf dem Kreis klicken oder Durchmesser tippen',
      ],
      circle2p: [
        'Kreis über 2 Punkte: Punkt klicken',
        'Kreis über 2 Punkte: gegenüberliegenden Punkt klicken oder Durchmesser tippen',
      ],
      circle3p: [
        'Kreis über 3 Punkte: ersten Punkt klicken',
        'Kreis über 3 Punkte: zweiten Punkt klicken',
        'Kreis über 3 Punkte: dritten Punkt klicken',
      ],
      circle2t: [
        'Kreis tangential an 2: erste Linie oder ersten Kreis klicken',
        'Kreis tangential an 2: zweite Linie oder zweiten Kreis klicken',
        'Kreis tangential an 2: Punkt des Kreises klicken oder Durchmesser tippen',
      ],
      circle3t: [
        'Kreis tangential an 3: erste Linie oder ersten Kreis klicken',
        'Kreis tangential an 3: zweite Linie oder zweiten Kreis klicken',
        'Kreis tangential an 3: dritte Linie oder dritten Kreis klicken',
        'Kreis tangential an 3: in den gewünschten Kreis zeigen und klicken',
      ],
      arc3p: [
        'Bogen über 3 Punkte: Start klicken',
        'Bogen über 3 Punkte: Ende klicken',
        'Bogen über 3 Punkte: Punkt auf dem Bogen klicken oder Radius tippen',
      ],
      arcCenter: [
        'Bogen vom Mittelpunkt: Mitte klicken',
        'Bogen vom Mittelpunkt: Start klicken oder Radius und Startwinkel tippen',
        'Bogen vom Mittelpunkt: Ende klicken oder Bogenwinkel tippen',
      ],
      arcTangent: [
        'Tangentialer Bogen: Ende einer Linie oder eines Bogens klicken',
        'Tangentialer Bogen: Ende klicken oder Radius und Bogenwinkel tippen',
      ],
    },
    failed: 'Die Form konnte nicht gezeichnet werden.',
    noTarget: 'An dieser Stelle ist keine Kante, kein Kreis und kein Linienende.',
    noSolution: 'Kein Kreis berührt diese.',
  },
});
