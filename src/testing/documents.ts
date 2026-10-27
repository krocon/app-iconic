import { IconDocumentDto } from '../app/core/icon-file/icon-file.models';
import { IconDocument } from '../app/features/document/icon-document';
import { ALL_FIELDS_ICON } from './fixtures/all-fields-icon';
import { CAMSCANNER_ICON } from './fixtures/camscanner-icon';

/** The camscanner fixture as the backend would send it after `open_icon`. */
export function camscannerDto(path: string | null = '/fixtures/camscanner.icon'): IconDocumentDto {
  return {
    path,
    name: path === null ? null : 'camscanner.icon',
    format: 'bundle',
    iconJson: JSON.parse(CAMSCANNER_ICON.iconJson),
    assets: CAMSCANNER_ICON.assets.map((a) => ({ name: a.name, kind: 'svg', text: a.text })),
    warnings: [],
  };
}

export function camscannerDocument(path?: string | null): IconDocument {
  return IconDocument.fromDto(camscannerDto(path));
}

/** `testdata/fixtures/all-fields.icon` (design 010 E11): every documented field. */
export function allFieldsDocument(path: string | null = '/fixtures/all-fields.icon'): IconDocument {
  return IconDocument.fromDto({
    path,
    name: path === null ? null : 'all-fields.icon',
    format: 'bundle',
    iconJson: JSON.parse(ALL_FIELDS_ICON.iconJson),
    assets: ALL_FIELDS_ICON.assets.map((a) => ({ name: a.name, kind: 'svg', text: a.text })),
    warnings: [],
  });
}

/** A small document: one group, one layer, one SVG asset `a.svg` with ids n1 (svg), n2 (g), n3, n4. */
export function smallDocument(path: string | null = '/a.icon'): IconDocument {
  return IconDocument.fromDto({
    path,
    name: path === null ? null : 'a.icon',
    format: 'bundle',
    iconJson: {
      fill: 'automatic',
      groups: [{ layers: [{ 'image-name': 'a.svg', name: 'a' }], 'x-future': true }],
      'x-top': 1,
    },
    assets: [
      {
        name: 'a.svg',
        kind: 'svg',
        text:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">' +
          '<g><rect width="10" fill="red"/><circle r="5"/></g></svg>\n',
      },
      { name: 'p.png', kind: 'png', dataUrl: 'data:image/png;base64,AAAA' },
    ],
    warnings: [],
  });
}

/** A document with one group / layer showing `a.svg` = `<svg viewBox="0 0 100 100">body</svg>`. */
export function svgDocument(body: string, attrs = 'viewBox="0 0 100 100"'): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: { groups: [{ layers: [{ 'image-name': 'a.svg', name: 'a' }] }] },
    assets: [
      {
        name: 'a.svg',
        kind: 'svg',
        text: `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`,
      },
    ],
    warnings: [],
  });
}
