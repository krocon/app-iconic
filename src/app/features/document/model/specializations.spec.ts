import { describe, expect, it } from 'vitest';
import { removeIn, setIn } from './icon-json';
import {
  hasVariant,
  JsonEdit,
  removeVariantEdits,
  resolveSpecialized,
  specializedEdits,
  specializedSubEdits,
} from './specializations';

/** Applies edits like `SetIconJsonValue` does (undefined = remove). */
function apply<T>(root: T, edits: JsonEdit[]): T {
  return edits.reduce(
    (r, e) => (e.value === undefined ? removeIn(r, e.path) : setIn(r, e.path, e.value)),
    root,
  );
}

const text = (v: unknown) => JSON.stringify(v);

describe('resolveSpecialized (design 010 E2)', () => {
  const group = {
    'shadow-specializations': [
      { value: { kind: 'neutral', opacity: 0.5 } },
      { appearance: 'dark', value: { kind: 'none', opacity: 0.5 } },
      { idiom: 'watchOS', value: { kind: 'layer-color', opacity: 1 } },
    ],
    specular: false,
  };

  it('variant of the appearance → base entry → key → default', () => {
    expect(resolveSpecialized(group, 'shadow', 'dark', null)).toEqual({
      value: { kind: 'none', opacity: 0.5 },
      source: 'variant',
      otherVariants: true,
    });
    expect(resolveSpecialized(group, 'shadow', 'tinted', null).value).toEqual({
      kind: 'neutral',
      opacity: 0.5,
    });
    expect(resolveSpecialized(group, 'specular', 'dark', true)).toEqual({
      value: false,
      source: 'base',
      otherVariants: false,
    });
    expect(resolveSpecialized(group, 'opacity', 'default', 1)).toEqual({
      value: 1,
      source: 'default',
      otherVariants: false,
    });
    expect(hasVariant(group, 'shadow', 'dark')).toBe(true);
    expect(hasVariant(group, 'shadow', 'default')).toBe(false);
  });

  it('a list without base falls back to the default; idiom entries are never read', () => {
    const o = { 'fill-specializations': [{ idiom: 'square', value: 'system-dark' }] };
    expect(resolveSpecialized(o, 'fill', 'default', 'automatic').value).toBe('automatic');
    const light = { 'hidden-specializations': [{ appearance: 'light', value: true }] };
    expect(resolveSpecialized(light, 'hidden', 'default', false)).toMatchObject({
      value: false,
      otherVariants: true,
    });
  });
});

describe('specializedEdits (design 010 E3, like Icon Composer)', () => {
  it('default writes the key, or the base entry of a list (inserted first if missing)', () => {
    expect(specializedEdits({ fill: 'automatic' }, [], 'fill', 'default', 'none')).toEqual([
      { path: ['fill'], value: 'none' },
    ]);
    const list = { 'fill-specializations': [{ value: 'a' }, { appearance: 'dark', value: 'b' }] };
    expect(specializedEdits(list, ['x'], 'fill', 'default', 'c')).toEqual([
      { path: ['x', 'fill-specializations', 0, 'value'], value: 'c' },
    ]);
    const onlyDark = { 'fill-specializations': [{ appearance: 'dark', value: 'b' }] };
    expect(apply(onlyDark, specializedEdits(onlyDark, [], 'fill', 'default', 'c'))).toEqual({
      'fill-specializations': [{ value: 'c' }, { appearance: 'dark', value: 'b' }],
    });
  });

  it('dark turns X into X-specializations at the same place, X goes away', () => {
    const root = { fill: 'automatic', groups: [] };
    const next = apply(root, specializedEdits(root, [], 'fill', 'dark', 'system-dark'));
    expect(text(next)).toBe(
      text({
        'fill-specializations': [
          { value: 'automatic' },
          { appearance: 'dark', value: 'system-dark' },
        ],
        groups: [],
      }),
    );
  });

  it('a missing key gets a list with only the variant; entries keep Icon Composer order', () => {
    const g = { layers: [] };
    const dark = apply(g, specializedEdits(g, [], 'specular', 'dark', false));
    expect(dark).toEqual({
      layers: [],
      'specular-specializations': [{ appearance: 'dark', value: false }],
    });
    const tinted = apply(dark, specializedEdits(dark, [], 'specular', 'tinted', true));
    const both = apply(tinted, specializedEdits(tinted, [], 'specular', 'default', true));
    expect(both['specular-specializations' as keyof typeof both]).toEqual([
      { value: true },
      { appearance: 'dark', value: false },
      { appearance: 'tinted', value: true },
    ]);
    // a tinted entry before an idiom entry, an existing variant is written in place
    const o = { 'x-specializations': [{ value: 1 }, { idiom: 'watchOS', value: 2 }] };
    expect(apply(o, specializedEdits(o, [], 'x', 'tinted', 3))['x-specializations']).toEqual([
      { value: 1 },
      { appearance: 'tinted', value: 3 },
      { idiom: 'watchOS', value: 2 },
    ]);
  });

  it('sub-fields: only the part when the object exists, else the whole value', () => {
    const g = { shadow: { kind: 'neutral', opacity: 0.5, 'x-keep': 1 } };
    expect(
      specializedSubEdits(g, ['groups', 0], 'shadow', 'default', ['opacity'], 0.2, null),
    ).toEqual([{ path: ['groups', 0, 'shadow', 'opacity'], value: 0.2 }]);
    const dark = apply(g, specializedSubEdits(g, [], 'shadow', 'dark', ['kind'], 'none', null));
    expect(dark).toEqual({
      'shadow-specializations': [
        { value: { kind: 'neutral', opacity: 0.5, 'x-keep': 1 } },
        { appearance: 'dark', value: { kind: 'none', opacity: 0.5, 'x-keep': 1 } },
      ],
    });
    const fallback = { kind: 'neutral', opacity: 0.5 };
    expect(
      apply({}, specializedSubEdits({}, [], 'shadow', 'default', ['opacity'], 1, fallback)),
    ).toEqual({
      shadow: { kind: 'neutral', opacity: 1 },
    });
  });
});

describe('removeVariantEdits (design 010 E3)', () => {
  it('add a variant and remove it again = the same bytes', () => {
    const cases: [Record<string, unknown>, string, unknown][] = [
      [{ fill: 'automatic', groups: [] }, 'fill', 'system-dark'],
      [{ layers: [] }, 'specular', false],
      [
        { 'opacity-specializations': [{ value: 1 }, { appearance: 'tinted', value: 0.5 }] },
        'opacity',
        0.2,
      ],
    ];
    for (const [o, key, v] of cases) {
      const added = apply(o, specializedEdits(o, [], key, 'dark', v));
      expect(hasVariant(added, key, 'dark')).toBe(true);
      const removed = apply(added, removeVariantEdits(added, [], key, 'dark'));
      expect(text(removed)).toBe(text(o));
    }
  });

  it('nothing to remove → no edits', () => {
    expect(removeVariantEdits({ fill: 'a' }, [], 'fill', 'dark')).toEqual([]);
    expect(
      removeVariantEdits({ 'fill-specializations': [{ value: 1 }] }, [], 'fill', 'default'),
    ).toEqual([]);
  });
});
