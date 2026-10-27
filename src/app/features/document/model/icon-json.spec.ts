import { IconJson } from '../../../core/icon-file/icon-file.models';
import { getIn, insertAt, layerNames, moveAt, removeIn, setIn } from './icon-json';

describe('icon-json', () => {
  const icon = {
    fill: 'automatic',
    groups: [{ layers: [{ name: 'a', 'x-future': 1 }], 'blend-mode': 'normal' }],
    'x-top': { keep: true },
  } as IconJson;

  it('reads paths', () => {
    expect(getIn(icon, ['groups', 0, 'layers', 0, 'name'])).toBe('a');
    expect(getIn(icon, ['groups', 3, 'layers'])).toBeUndefined();
    expect(getIn(icon, ['fill', 'x'])).toBeUndefined();
    expect(getIn(icon, ['groups', 'x'])).toBeUndefined();
  });

  it('sets without changing the original, keeps key order and unknown fields', () => {
    const next = setIn(icon, ['groups', 0, 'layers', 0, 'name'], 'b');
    expect(getIn(icon, ['groups', 0, 'layers', 0, 'name'])).toBe('a');
    expect(next.groups![0].layers![0]).toEqual({ name: 'b', 'x-future': 1 });
    expect(Object.keys(setIn(icon, ['fill'], 'system-dark'))).toEqual(['fill', 'groups', 'x-top']);
    expect(next['x-top']).toBe(icon['x-top']);
    expect(setIn(icon, ['groups', 0, 'shadow', 'opacity'], 0.3).groups![0].shadow).toEqual({
      opacity: 0.3,
    });
  });

  it('puts a new key at its alphabetical place in a sorted object (design 010 E4)', () => {
    const sorted = { fill: 'automatic', groups: [], 'supported-platforms': {} } as IconJson;
    expect(Object.keys(setIn(sorted, ['fill-specializations'], []))).toEqual([
      'fill',
      'fill-specializations',
      'groups',
      'supported-platforms',
    ]);
    expect(Object.keys(setIn(sorted, ['a'], 1))[0]).toBe('a');
    expect(Object.keys(setIn(sorted, ['z'], 1)).at(-1)).toBe('z');
    // an unsorted object keeps its order, new keys at the end
    const unsorted = { groups: [], fill: 'automatic' } as IconJson;
    expect(Object.keys(setIn(unsorted, ['color'], 'x'))).toEqual(['groups', 'fill', 'color']);
  });

  it('removes keys and array elements', () => {
    expect(Object.keys(removeIn(icon, ['fill']))).toEqual(['groups', 'x-top']);
    expect(removeIn(icon, ['groups', 0]).groups).toEqual([]);
    expect(removeIn(icon, ['nope', 'deeper'])).toBe(icon);
    expect(() => removeIn(icon, [])).toThrow();
  });

  it('inserts and moves array elements', () => {
    const two = insertAt(icon, ['groups'], 1, { layers: [] });
    expect(two.groups).toHaveLength(2);
    expect(moveAt(two, ['groups'], 1, 0).groups![0]).toEqual({ layers: [] });
    expect(insertAt({} as IconJson, ['groups'], 0, 1).groups).toEqual([1]);
    expect(() => insertAt(icon, ['groups'], 5, 1)).toThrow();
    expect(() => moveAt(icon, ['groups'], 0, 1)).toThrow();
  });

  it('lists layer names', () => {
    expect(layerNames(icon)).toEqual(['a']);
    expect(layerNames({ groups: 'broken' } as unknown as IconJson)).toEqual([]);
  });
});
