import { translatable } from '../../core/i18n/i18n';

/** Texts of the path tools (prompt 046). English is the source, German beside it. */
const EN = {
  hints: {
    addAnchor: 'Add Anchor Point: click a selected path',
    deleteAnchor: 'Delete Anchor Point: click a point of a selected path',
    anchorPoint:
      'Anchor Point: click a smooth point → corner (a corner → smooth), drag a point → new handles',
    scissors: 'Scissors: click a selected path to cut it there',
    smooth: 'Smooth: drag over a selected path to smooth its points',
    eraser: 'Path Eraser: drag over a selected path to erase that part',
  },
  noPath: 'Select a path or shape first.',
  escEnds: 'Esc ends',
} as const;

export const PATH_EDIT_TEXTS = translatable('pathEdit', EN, {
  de: {
    hints: {
      addAnchor: 'Ankerpunkt hinzufügen: ausgewählten Pfad klicken',
      deleteAnchor: 'Ankerpunkt löschen: Punkt eines ausgewählten Pfads klicken',
      anchorPoint:
        'Ankerpunkt umwandeln: glatten Punkt klicken → Ecke (Ecke → glatt), Punkt ziehen → neue Griffe',
      scissors: 'Schere: ausgewählten Pfad dort klicken, wo er geteilt wird',
      smooth: 'Glätten: über einen ausgewählten Pfad ziehen, um seine Punkte zu glätten',
      eraser: 'Pfad-Radiergummi: über einen ausgewählten Pfad ziehen, um diesen Teil zu löschen',
    },
    noPath: 'Zuerst einen Pfad oder eine Form auswählen.',
    escEnds: 'Esc beendet',
  },
});
