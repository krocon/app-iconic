import { translatable } from '../../core/i18n/i18n';

/** Texts of "Import Image as Layer" / "Replace Layer Image" and the layer handles (prompt 080). */
const EN = {
  imported: (name: string) => `Imported “${name}” as a new layer.`,
  converted: (name: string) => `Imported “${name}” as a new layer (converted to PNG).`,
  replaced: (name: string) => `Replaced the image “${name}”.`,
  importFailed: 'The image could not be imported.',
  replaceFailed: 'The image could not be replaced.',
  notDecodable: 'The image could not be read.',
  invalidSvg: 'The file is not a valid SVG.',
  replaceNeedsRaster: 'Choose a PNG, JPEG or WebP image to replace a layer image.',
  noRasterLayer: 'Select a layer that shows a PNG image.',
  handles: {
    frame: 'Layer – drag to move',
    corner: 'Scale the layer about its centre',
  },
} as const;

export const IMAGE_LAYER_TEXTS = translatable('imageLayer', EN, {
  de: {
    imported: (name: string) => `„${name}“ als neue Ebene importiert.`,
    converted: (name: string) => `„${name}“ als neue Ebene importiert (nach PNG umgewandelt).`,
    replaced: (name: string) => `Bild „${name}“ ersetzt.`,
    importFailed: 'Das Bild konnte nicht importiert werden.',
    replaceFailed: 'Das Bild konnte nicht ersetzt werden.',
    notDecodable: 'Das Bild konnte nicht gelesen werden.',
    invalidSvg: 'Die Datei ist kein gültiges SVG.',
    replaceNeedsRaster: 'Zum Ersetzen eines Ebenenbilds ein PNG-, JPEG- oder WebP-Bild wählen.',
    noRasterLayer: 'Eine Ebene wählen, die ein PNG-Bild zeigt.',
    handles: {
      frame: 'Ebene – ziehen zum Verschieben',
      corner: 'Ebene um ihre Mitte skalieren',
    },
  },
});
