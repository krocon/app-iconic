import {
  CONSTRAINT_ADD_ARGS,
  CONSTRAINT_TOOL_ARGS,
} from '../../core/actions/constraint-action-args';
import { CONSTRAINT_TYPES } from '../../shared/geometry/constraints/constraints';
import { IDENTITY } from '../../shared/geometry/matrix';
import { picksFrom } from './constraint-actions';
import { constraintFrom } from './constraint-storage';
import { GLYPHS, overlayItems, valueText } from './constraint-view';

describe('constraint overlay model and arguments (prompt 059)', () => {
  it('every type has a glyph and is offered to the AI', () => {
    for (const t of CONSTRAINT_TYPES) expect(GLYPHS[t]).toBeTruthy();
    const enumOf = (s: typeof CONSTRAINT_TOOL_ARGS) =>
      (s.properties['type'] as { enum: readonly string[] }).enum;
    expect(enumOf(CONSTRAINT_TOOL_ARGS)).toEqual(CONSTRAINT_TYPES);
    expect(enumOf(CONSTRAINT_ADD_ARGS)).toEqual(CONSTRAINT_TYPES);
  });

  it('badges stack at one place; dimensions carry their value', () => {
    const at = (ref: string) =>
      ref === 'c1.line'
        ? { line: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } } }
        : ref === 'c2.circle'
          ? { circle: { c: { x: 50, y: 50 }, r: 10 } }
          : null;
    const { badges, dims } = overlayItems(
      'a.svg',
      [
        { id: 'k1', type: 'horizontal', refs: ['c1.line'] },
        { id: 'k2', type: 'parallel', refs: ['c1.line', 'c1.line'] },
        { id: 'k3', type: 'length', refs: ['c1.line'], value: 100 },
        { id: 'k4', type: 'diameter', refs: ['c2.circle'], value: 20 },
        { id: 'k5', type: 'fix', refs: ['gone.p1'], point: [0, 0] },
      ],
      at,
      IDENTITY,
    );
    expect(badges.map((b) => [b.id, b.glyph, b.at.x])).toEqual([
      ['k1', 'H', 60],
      ['k2', '∥', 78],
    ]);
    expect(dims.map((d) => [d.id, d.text])).toEqual([
      ['k3', '100'],
      ['k4', '⌀ 20'],
    ]);
    expect(valueText({ id: 'a', type: 'angle', refs: [], value: -30 })).toBe('30°');
  });

  it('checks stored and AI input', () => {
    expect(constraintFrom({ id: 'k1', type: 'fix', refs: ['c1.tl'], point: [1, 2] })).toEqual({
      id: 'k1',
      type: 'fix',
      refs: ['c1.tl'],
      point: [1, 2],
    });
    expect(constraintFrom({ id: 'k1', type: 'glue', refs: ['c1.tl'] })).toBeNull();
    expect(constraintFrom({ id: 'k1', type: 'fix', refs: ['<x>.tl'] })).toBeNull();
    expect(constraintFrom({ id: 'k1', type: 'length', refs: ['c1.top'], value: 'x' })).toBeNull();
    expect(picksFrom([{ node: { asset: 'a.svg', id: 'n2' }, part: 'top' }])).toEqual([
      { node: { asset: 'a.svg', id: 'n2' }, part: 'top' },
    ]);
    expect(picksFrom([{ node: { asset: 'a.svg' }, part: 'top' }])).toBeNull();
    expect(picksFrom([])).toBeNull();
  });
});
