import { IconDocumentDto } from '../../core/icon-file/icon-file.models';
import { IconDocument } from './icon-document';
import { DocumentStore } from './document.store';

/**
 * Hostile documents (prompt 031): whatever a `.icon` brings – broken or missing assets, odd
 * `icon.json`, active content, extreme nesting, long and Unicode names – the document opens and
 * the editor keeps working; nothing throws, nothing active reaches the WebView.
 */

const svg = (body: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;

function dto(iconJson: unknown, assets: IconDocumentDto['assets']): IconDocumentDto {
  return {
    path: '/hostile.icon',
    name: 'hostile.icon',
    format: 'zip',
    iconJson: iconJson as IconDocumentDto['iconJson'],
    assets,
    warnings: [],
  };
}

const layer = (name: string) => ({ groups: [{ layers: [{ 'image-name': name, name: 'l' }] }] });

/** Opens `d` and runs a few everyday operations on it. */
function openAndUse(d: IconDocumentDto): IconDocument {
  const doc = IconDocument.fromDto(d);
  const store = new DocumentStore(doc);
  for (const [, asset] of doc.assets) {
    const root = asset.svg?.root;
    if (!root) continue;
    const ref = doc.refOf(root);
    if (ref) store.select([ref]);
  }
  store.clearSelection();
  return doc;
}

/** The serialised markup of every SVG asset. */
function markup(doc: IconDocument): string {
  return [...doc.assets.values()]
    .map((a) => (a.svg ? new XMLSerializer().serializeToString(a.svg.root) : ''))
    .join('\n');
}

describe('hostile documents (prompt 031)', () => {
  it('a layer whose asset is missing', () => {
    const doc = openAndUse(dto(layer('gone.svg'), []));
    expect(doc.assets.has('gone.svg')).toBe(false);
  });

  it('an asset that is no SVG / no XML at all', () => {
    for (const text of [
      '',
      'not xml <<<',
      '<html><body>x</body></html>',
      '<?xml version="1.0"?>',
    ]) {
      expect(() =>
        openAndUse(dto(layer('a.svg'), [{ name: 'a.svg', kind: 'svg', text }])),
      ).not.toThrow();
    }
  });

  it('odd icon.json shapes', () => {
    for (const json of [
      {},
      { groups: null },
      { groups: 'x' },
      { groups: [null, 1, 'x', { layers: 'y' }, { layers: [null, { 'image-name': 42 }] }] },
      { fill: { 'automatic-gradient': 'not a colour' }, groups: [] },
      { groups: [{ layers: [{ 'image-name': '../../etc/passwd', name: 'x' }] }] },
    ]) {
      expect(() => openAndUse(dto(json, []))).not.toThrow();
    }
  });

  it('active content never reaches the document', () => {
    const doc = openAndUse(
      dto(layer('a.svg'), [
        {
          name: 'a.svg',
          kind: 'svg',
          text: svg(
            '<script>alert(1)</script>' +
              '<rect width="10" height="10" onload="alert(2)" onclick="alert(3)"/>' +
              '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>' +
              '<a href="javascript:alert(4)"><circle r="3"/></a>' +
              '<a xlink:href="javascript:alert(5)"><circle r="4"/></a>' +
              '<use href="https://evil.example/x.svg#a"/>' +
              '<image href="file:///etc/passwd" width="1" height="1"/>' +
              '<rect width="5" height="5" style="fill: url(https://evil.example/x)"/>' +
              '<style>@import url(https://evil.example/x.css); rect { fill: red }</style>' +
              '<set attributeName="onmouseover" to="alert(6)"/>' +
              '<animate attributeName="href" to="javascript:alert(7)"/>',
          ),
        },
      ]),
    );
    const m = markup(doc).toLowerCase();
    expect(m).not.toContain('<script');
    expect(m).not.toContain('onload');
    expect(m).not.toContain('onclick');
    expect(m).not.toContain('javascript:');
    expect(m).not.toContain('foreignobject');
    expect(m).not.toContain('evil.example');
    expect(m).not.toContain('file:///');
    expect(m).not.toContain('alert(');
  });

  // jsdom clones recursively (its stack ends near 5 000 levels); browsers stop parsing at ~3 000
  // (Chromium: "Excessive depth" → an unreadable asset, above) – e2e/hostile.spec.ts runs 5 000 in
  // Chromium
  it('extreme nesting and size', () => {
    const deep = '<g>'.repeat(1_000) + '<rect width="1" height="1"/>' + '</g>'.repeat(1_000);
    const wide = '<rect width="1" height="1"/>'.repeat(20_000);
    for (const body of [deep, wide]) {
      const doc = openAndUse(
        dto(layer('a.svg'), [{ name: 'a.svg', kind: 'svg', text: svg(body) }]),
      );
      expect(doc.assets.get('a.svg')?.svg).toBeTruthy();
    }
  });

  it('long and Unicode names', () => {
    const long = 'x'.repeat(300);
    const uni = 'Ébène 🎨 中文 א‏\u0000';
    const doc = openAndUse(
      dto({ groups: [{ name: long, layers: [{ 'image-name': `${uni}.svg`, name: uni }] }] }, [
        { name: `${uni}.svg`, kind: 'svg', text: svg(`<text>${'ü'.repeat(1000)}</text>`) },
      ]),
    );
    expect(doc.assets.has(`${uni}.svg`)).toBe(true);
  });
});
