import { ALL_FIELDS_ICON } from '../../../testing/fixtures/all-fields-icon';
import { CAMSCANNER_ICON } from '../../../testing/fixtures/camscanner-icon';
import { SVG_FIXTURES } from '../../../testing/fixtures/svg-fixtures';
import { IconDocumentDto } from '../../core/icon-file/icon-file.models';
import { SetAttribute } from './commands';
import { DocumentStore } from './document.store';
import { IconDocument } from './icon-document';
import { serializeAsset } from './svg/node-ids';

/**
 * Round-trip guarantee (prompt 031): open → change one place → save request → only that place
 * differs from the file. Every SVG fixture as the asset of a `.icon`; the other assets of the
 * document go back as `unchanged` (the backend writes their bytes as read, rs `save.rs`).
 */

function open(assets: { name: string; text: string }[]): IconDocument {
  const dto: IconDocumentDto = {
    path: '/fixture.icon',
    name: 'fixture.icon',
    format: 'bundle',
    iconJson: { groups: [{ layers: assets.map((a) => ({ 'image-name': a.name, name: a.name })) }] },
    assets: assets.map((a) => ({ name: a.name, kind: 'svg' as const, text: a.text })),
    warnings: [],
  };
  return IconDocument.fromDto(dto);
}

/** Lines of `b` that are not in `a` (in order) – a cheap line diff. */
function changedLines(a: string, b: string): string[] {
  const before = a.split('\n');
  const after = b.split('\n');
  let start = 0;
  while (start < before.length && before[start] === after[start]) start++;
  let endA = before.length;
  let endB = after.length;
  while (endA > start && endB > start && before[endA - 1] === after[endB - 1]) {
    endA--;
    endB--;
  }
  return after.slice(start, endB);
}

const svgs = [...SVG_FIXTURES, ...CAMSCANNER_ICON.assets, ...ALL_FIELDS_ICON.assets].filter(
  (f) => f.name.endsWith('.svg') && typeof f.text === 'string',
);

describe('round-trip: one edit, one place (prompt 031)', () => {
  it.each(svgs.map((f) => [f.name, f.text] as const))('%s', (name, text) => {
    const doc = open([
      { name, text },
      { name: 'other.svg', text: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' },
    ]);
    const asset = doc.assets.get(name)!;
    const store = new DocumentStore(doc);
    // the first shape gets one new attribute
    const el = asset.svg!.root.querySelector(
      'path, rect, circle, ellipse, polygon, polyline, line',
    );
    if (!el) return;
    // the form an edited asset is written in: the DOM serialisation (design 003 E3) – it
    // normalises whitespace inside tags and empty elements once; unedited assets stay bytes
    const base = serializeAsset(asset.svg!);
    expect(doc.saveRequest('/fixture.icon', 'bundle').assets.every((x) => x.unchanged)).toBe(true);
    store.execute(new SetAttribute(doc.refOf(el)!, 'data-roundtrip', '1'));
    const req = doc.saveRequest('/fixture.icon', 'bundle');
    const other = req.assets.find((x) => x.name === 'other.svg')!;
    const mine = req.assets.find((x) => x.name === name)!;
    expect(other.unchanged).toBe(true);
    expect(mine.unchanged).toBe(false);
    // one changed line, and in it nothing but the new attribute
    const diff = changedLines(base, mine.text!);
    expect(diff).toHaveLength(1);
    expect(diff[0]).toContain('data-roundtrip="1"');
    expect(mine.text!.replace(' data-roundtrip="1"', '')).toBe(base);
    // undo: back to the bytes of the file
    store.undo();
    expect(doc.saveRequest('/fixture.icon', 'bundle').assets.every((x) => x.unchanged)).toBe(true);
  });
});
