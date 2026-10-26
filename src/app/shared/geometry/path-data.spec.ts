import { parsePath, serializePath, withStarts } from './path-data';

describe('path data (design 007 E8)', () => {
  it.each([
    'M0 0 L100 0 L100 100',
    'm10,10 l5,5 5,5 h10 v-3 z',
    '  M 1 2 C 3 4 5 6 7 8 S 9 10 11 12 Q 1 1 2 2 T 3 3 A 5 5 0 1 0 10 10 Z  ',
    'M.5.5l-1-1e2',
    'M10 10a5 5 0 0010 0',
    'M0 0 10 10 20 0',
  ])('puts %j together unchanged', (d) => {
    const segs = parsePath(d)!;
    expect(segs).not.toBeNull();
    expect(serializePath(segs)).toBe(d);
  });

  it('rejects invalid data', () => {
    expect(parsePath('L 0 0')).toBeNull();
    expect(parsePath('M 0')).toBeNull();
    expect(parsePath('M0 0 Z 5 5')).toBeNull();
    expect(parsePath('')).toBeNull();
    expect(parsePath('M0 0 A 1 1 0 2 0 1 1')).toBeNull();
  });

  it('knows absolute points of relative, implicit and short commands', () => {
    const s = parsePath('m10 10 5 5 h10 v-3 s 1 1 2 2 t 4 4 z')!;
    expect(s.map((x) => x.cmd)).toEqual(['M', 'L', 'H', 'V', 'S', 'T', 'Z']);
    expect(s[1]).toMatchObject({ implicit: true, rel: true, p: { x: 15, y: 15 } });
    expect(s[2].p).toEqual({ x: 25, y: 15 });
    expect(s[3].p).toEqual({ x: 25, y: 12 });
    expect(s[4].c1).toEqual({ x: 25, y: 12 }); // no C before: the current point
    expect(s[4].c2).toEqual({ x: 26, y: 13 });
    expect(s[6].p).toEqual({ x: 10, y: 10 });
    const arc = parsePath('M0 0a5 6 7 1 0 10 0')![1];
    expect(arc.arc).toEqual({ rx: 5, ry: 6, rot: 7, large: 1, sweep: 0 });
    expect(arc.p).toEqual({ x: 10, y: 0 });
  });

  it('re-writes only changed segments, relative stays relative', () => {
    const s = parsePath('M0 0 l10 0 l0 10 L 50 50')!;
    s[1] = { ...s[1], p: { x: 20, y: 0 } };
    // segment 2 is relative and starts elsewhere now: written anew with the same absolute end
    expect(serializePath(withStarts(s))).toBe('M0 0 l20 0 l-10 10 L 50 50');
  });

  it('an implicit segment after a changed one keeps its command', () => {
    const s = parsePath('M0 0 H10 20 30')!;
    s[1] = { ...s[1], p: { x: 10, y: 5 } };
    expect(serializePath(s)).toBe('M0 0 L10 5 H20 30');
  });

  it('H/V become L when the other coordinate changes; S becomes C when its reflection breaks', () => {
    const v = parsePath('M0 0 V10')!;
    v[1] = { ...v[1], p: { x: 3, y: 10 } };
    expect(serializePath(v)).toBe('M0 0 L3 10');
    const c = parsePath('M0 0 C 0 10 10 10 10 0 S 20 -10 20 0')!;
    c[1] = { ...c[1], c2: { x: 5, y: 10 } };
    // the old reflection (10 -10) is kept as an explicit control: the curve looks the same
    expect(serializePath(c)).toBe('M0 0 C0 10 5 10 10 0 C10 -10 20 -10 20 0');
  });
});
