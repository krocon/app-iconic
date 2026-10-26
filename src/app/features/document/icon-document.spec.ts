import { CAMSCANNER_ICON } from '../../../testing/fixtures/camscanner-icon';
import { camscannerDocument, smallDocument } from '../../../testing/documents';
import { IconDocument } from './icon-document';
import { serializeAsset } from './svg/node-ids';

describe('IconDocument', () => {
  it('reads the fixture: icon.json as is, every SVG parsed with ids', () => {
    const doc = camscannerDocument();
    expect(doc.name).toBe('camscanner.icon');
    expect(doc.iconJson.groups?.[0].layers?.[0].opacity).toBe(1);
    expect([...doc.assets.keys()]).toEqual(CAMSCANNER_ICON.assets.map((a) => a.name));
    const svg = doc.assets.get('logo-scanner 3.svg')!.svg!;
    expect(svg.doc.documentElement.getAttribute('data-ai-id')).toBe('n1');
    expect(doc.notices).toEqual([]);
  });

  it('finds nodes by ref and refs by node', () => {
    const doc = smallDocument();
    const rect = doc.node({ asset: 'a.svg', id: 'n3' })!;
    expect(rect.localName).toBe('rect');
    expect(doc.refOf(rect)).toEqual({ asset: 'a.svg', id: 'n3' });
    expect(doc.node({ asset: 'a.svg', id: 'n99' })).toBeNull();
    expect(doc.node({ asset: 'a.svg', id: '"]x' })).toBeNull();
    expect(doc.node({ asset: 'p.png', id: 'n1' })).toBeNull();
  });

  it('saves an unchanged document with every asset unchanged', () => {
    const doc = camscannerDocument();
    const r = doc.saveRequest(doc.path!, 'bundle');
    expect(r.assets.every((a) => a.unchanged && a.text === undefined)).toBe(true);
    expect(r.iconJson).toBe(doc.iconJson);
    expect(r.from).toBeNull();
  });

  it('sends only the changed asset, and "Save As" names the old path', () => {
    const doc = smallDocument();
    doc.node({ asset: 'a.svg', id: 'n3' })!.setAttribute('fill', 'blue');
    const r = doc.saveRequest('/b.icon', 'zip');
    expect(r.from).toBe('/a.icon');
    expect(r.assets).toEqual([
      { name: 'a.svg', unchanged: false, text: expect.stringContaining('fill="blue"') },
      { name: 'p.png', unchanged: true },
    ]);
    expect(r.assets[0].text).not.toContain('data-ai-');
    doc.markSaved({ path: '/b.icon', name: 'b.icon', format: 'zip' });
    expect(doc.saveRequest('/b.icon', 'zip').assets.every((a) => a.unchanged)).toBe(true);
    expect([doc.path, doc.name, doc.format]).toEqual(['/b.icon', 'b.icon', 'zip']);
  });

  it('a change undone by hand counts as unchanged', () => {
    const doc = smallDocument();
    const rect = doc.node({ asset: 'a.svg', id: 'n3' })!;
    rect.setAttribute('fill', 'blue');
    rect.setAttribute('fill', 'red');
    expect(doc.saveRequest('/a.icon', 'bundle').assets[0].unchanged).toBe(true);
  });

  it('a new document sends every asset with its text', () => {
    const doc = smallDocument(null);
    doc.assets.delete('p.png');
    const r = doc.saveRequest('/n.icon', 'bundle');
    expect(r.from).toBeNull();
    expect(r.assets).toEqual([{ name: 'a.svg', unchanged: false, text: expect.any(String) }]);
  });

  it('keeps unparsable SVG as text and reports it', () => {
    const doc = IconDocument.fromDto({
      path: '/x.icon',
      name: 'x.icon',
      format: 'bundle',
      iconJson: {},
      assets: [
        { name: 'bad.svg', kind: 'svg', text: '<svg><g></svg>' },
        {
          name: 'evil.svg',
          kind: 'svg',
          text: '<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>',
        },
      ],
      warnings: [{ code: 'missing_asset', name: 'gone.svg' }],
    });
    expect(doc.assets.get('bad.svg')).toMatchObject({ text: '<svg><g></svg>' });
    expect(doc.notices).toEqual([
      { code: 'missing_asset', name: 'gone.svg' },
      { code: 'unparsable_svg', name: 'bad.svg' },
      { code: 'script', name: 'evil.svg' },
    ]);
    // the cleaned asset is "unchanged" → the file keeps its bytes (design 003 E4)
    expect(doc.saveRequest('/x.icon', 'bundle').assets.every((a) => a.unchanged)).toBe(true);
    expect(serializeAsset(doc.assets.get('evil.svg')!.svg!)).not.toContain('script');
  });

  it('ids are unique across assets', () => {
    const doc = camscannerDocument();
    const ids = [...doc.assets.values()].flatMap((a) =>
      [...a.svg!.doc.querySelectorAll('[data-ai-id]')].map((e) => e.getAttribute('data-ai-id')),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
