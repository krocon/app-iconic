import { NodeSetProvider, SetData } from './node-set-provider';
import {
  ALL_SETS,
  itemKey,
  pickerItems,
  previewPaint,
  RECENT_SETS,
  setsFor,
} from './symbol-picker-model';

const license = { name: 'MIT License', spdx: 'MIT', url: 'https://example.org', package: 'x' };

function set(id: string, ids: string[], tags: Record<string, string[]> = {}): NodeSetProvider {
  const data: SetData = {
    set: id,
    version: '1',
    size: 24,
    nodes: Object.fromEntries(ids.map((i) => [i, ['M0 0']])),
    tags,
  };
  return new NodeSetProvider({
    id,
    name: id.toUpperCase(),
    license,
    paint: 'fill',
    load: () => Promise.resolve(data),
  });
}

describe('pickerItems (design 084 E13)', () => {
  const a = set('a', ['heart', 'star', 'apple'], { apple: ['fruit'] });
  const b = set('b', ['heart-crack', 'moon'], { moon: ['night', 'heart'] });
  const providers = [a, b];

  beforeAll(async () => {
    await Promise.all(providers.map((p) => p.load()));
  });

  it('one set: its matches with the set', () => {
    expect(pickerItems('b', providers, [], '', 10).items.map(itemKey)).toEqual([
      'b:heart-crack',
      'b:moon',
    ]);
    expect(pickerItems('x', providers, [], '', 10)).toEqual({ items: [], total: 0 });
  });

  it('all sets: one ranking – name matches first, then tags, sets mixed', () => {
    const r = pickerItems(ALL_SETS, providers, [], 'heart', 10);
    expect(r.items.map(itemKey)).toEqual(['a:heart', 'b:heart-crack', 'b:moon']);
    expect(pickerItems(ALL_SETS, providers, [], '', 2)).toEqual({
      items: expect.any(Array),
      total: 5,
    });
  });

  it('recently used: in their order, unknown ones left out, the search filters', () => {
    const recent = [
      { set: 'b', id: 'moon' },
      { set: 'a', id: 'gone' },
      { set: 'z', id: 'heart' },
      { set: 'a', id: 'apple' },
    ];
    expect(pickerItems(RECENT_SETS, providers, recent, '', 10).items.map(itemKey)).toEqual([
      'b:moon',
      'a:apple',
    ]);
    expect(pickerItems(RECENT_SETS, providers, recent, 'fruit', 10).items.map(itemKey)).toEqual([
      'a:apple',
    ]);
    expect(setsFor(RECENT_SETS, providers, recent)).toEqual([a, b]);
    expect(setsFor('b', providers, recent)).toEqual([b]);
    expect(setsFor(ALL_SETS, providers, [])).toEqual(providers);
  });

  it('preview paint: none stays, colours become the text colour unless the set keeps them', () => {
    expect(previewPaint(undefined, false)).toBeNull();
    expect(previewPaint('none', true)).toBe('none');
    expect(previewPaint('#ff0000', false)).toBe('currentColor');
    expect(previewPaint('#ff0000', true)).toBe('#ff0000');
  });
});
