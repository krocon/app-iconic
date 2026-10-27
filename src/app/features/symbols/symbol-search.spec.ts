import { searchSymbols } from './symbol-search';

const S = (id: string, tags: string[] = []) => ({ id, name: id.replace(/-/g, ' '), tags });
const ALL = [
  S('heart', ['love', 'like']),
  S('heart-crack', ['broken']),
  S('apple', ['fruit']),
  S('smile', ['happy', 'heart']),
];

describe('searchSymbols', () => {
  it('empty query lists everything up to the limit', () => {
    expect(searchSymbols(ALL, '  ', 2)).toEqual({ items: ALL.slice(0, 2), total: 4 });
  });

  it('name matches before tag matches, a name starting with the query first', () => {
    const r = searchSymbols(ALL, 'heart', 10);
    expect(r.items.map((s) => s.id)).toEqual(['heart', 'heart-crack', 'smile']);
    expect(searchSymbols(ALL, 'crack', 10).items.map((s) => s.id)).toEqual(['heart-crack']);
  });

  it('every word must match, without case, dash = space', () => {
    expect(searchSymbols(ALL, 'HEART broken', 10).items.map((s) => s.id)).toEqual(['heart-crack']);
    expect(searchSymbols(ALL, 'heart-crack', 10).items.map((s) => s.id)).toEqual(['heart-crack']);
    expect(searchSymbols(ALL, 'fruit', 10).items.map((s) => s.id)).toEqual(['apple']);
    expect(searchSymbols(ALL, 'nothing', 10)).toEqual({ items: [], total: 0 });
  });

  it('the limit cuts, total counts all', () => {
    expect(searchSymbols(ALL, 'heart', 1)).toEqual({ items: [ALL[0]], total: 3 });
  });
});
