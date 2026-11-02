import { translatable } from '../../core/i18n/i18n';

/** Texts of "Trace Image" (prompt 087). */
const EN = {
  title: 'Trace Image',
  source: 'Image',
  sources: {
    layer: 'Selected layer',
    template: 'Template',
    clipboard: 'Clipboard',
    file: 'File…',
  },
  size: (w: number, h: number) => `${w} × ${h} px`,
  preset: 'Style',
  presets: {
    shapes: 'As by hand',
    detail: 'Detailed',
    flat: 'Flat',
    pixel: 'Pixel art',
    mono: 'Black & white',
  },
  presetHints: {
    shapes: 'Rectangles, circles and gradients where the image has them – like drawn by hand.',
    detail: 'Many colours and curves, close to the image.',
    flat: 'Few colours, large areas.',
    pixel: 'Exact pixel steps, no curves.',
    mono: 'Only the dark parts, in black.',
  },
  details: 'Details',
  curves: 'Outlines',
  curveModes: { spline: 'Curves', polygon: 'Straight edges', pixel: 'Pixel steps' },
  colorPrecision: 'Colour precision',
  layerDifference: 'Colour steps',
  speckle: 'Smallest area (px)',
  threshold: 'Threshold',
  shapes: 'Recognise shapes',
  gradients: 'Gradients',
  harmonize: 'Equal sizes and colours',
  dropBackground: 'Leave out the background',
  original: 'Original',
  result: 'Result',
  tracing: 'Tracing…',
  stats: (s: {
    elements: number;
    paths: number;
    rects: number;
    ellipses: number;
    gradients: number;
    colors: number;
    ms: number;
  }) =>
    `${s.elements} elements: ${s.rects} rectangles, ${s.ellipses} ellipses, ${s.paths} paths, ` +
    `${s.gradients} gradients, ${s.colors} colours · ${(s.ms / 1000).toFixed(1)} s`,
  cancel: 'Cancel',
  insert: 'Insert as Layer',
  inserted: (name: string, n: number) => `Traced into the new layer “${name}” (${n} elements).`,
  failed: 'The image could not be traced.',
  noImage: 'Nothing to trace.',
  noRasterLayer: 'Select a layer that shows a PNG image.',
  noTemplate: 'There is no template (View › Template).',
  noClipboardImage: 'The clipboard holds no image.',
  notDecodable: 'The image could not be read.',
} as const;

export const TRACE_TEXTS = translatable('trace', EN, {
  de: {
    title: 'Bild nachzeichnen',
    source: 'Bild',
    sources: {
      layer: 'Gewählte Ebene',
      template: 'Vorlage',
      clipboard: 'Zwischenablage',
      file: 'Datei …',
    },
    size: (w: number, h: number) => `${w} × ${h} px`,
    preset: 'Stil',
    presets: {
      shapes: 'Wie von Hand',
      detail: 'Detailliert',
      flat: 'Flach',
      pixel: 'Pixelgrafik',
      mono: 'Schwarzweiß',
    },
    presetHints: {
      shapes: 'Rechtecke, Kreise und Verläufe, wo das Bild sie hat – wie von Hand gezeichnet.',
      detail: 'Viele Farben und Kurven, nah am Bild.',
      flat: 'Wenige Farben, große Flächen.',
      pixel: 'Exakte Pixelstufen, keine Kurven.',
      mono: 'Nur die dunklen Teile, in Schwarz.',
    },
    details: 'Details',
    curves: 'Umrisse',
    curveModes: { spline: 'Kurven', polygon: 'Gerade Kanten', pixel: 'Pixelstufen' },
    colorPrecision: 'Farbgenauigkeit',
    layerDifference: 'Farbstufen',
    speckle: 'Kleinste Fläche (px)',
    threshold: 'Schwelle',
    shapes: 'Formen erkennen',
    gradients: 'Verläufe',
    harmonize: 'Gleiche Größen und Farben',
    dropBackground: 'Hintergrund weglassen',
    original: 'Original',
    result: 'Ergebnis',
    tracing: 'Zeichne nach …',
    stats: (s: {
      elements: number;
      paths: number;
      rects: number;
      ellipses: number;
      gradients: number;
      colors: number;
      ms: number;
    }) =>
      `${s.elements} Elemente: ${s.rects} Rechtecke, ${s.ellipses} Ellipsen, ${s.paths} Pfade, ` +
      `${s.gradients} Verläufe, ${s.colors} Farben · ${(s.ms / 1000).toFixed(1).replace('.', ',')} s`,
    cancel: 'Abbrechen',
    insert: 'Als Ebene einfügen',
    inserted: (name: string, n: number) =>
      `In die neue Ebene „${name}“ nachgezeichnet (${n} Elemente).`,
    failed: 'Das Bild konnte nicht nachgezeichnet werden.',
    noImage: 'Nichts zum Nachzeichnen.',
    noRasterLayer: 'Eine Ebene wählen, die ein PNG-Bild zeigt.',
    noTemplate: 'Es gibt keine Vorlage (Ansicht › Vorlage).',
    noClipboardImage: 'Die Zwischenablage enthält kein Bild.',
    notDecodable: 'Das Bild konnte nicht gelesen werden.',
  },
});
