import { apply, multiply } from '../../shared/geometry/matrix';
import {
  addStep,
  displayNumber,
  hasPivot,
  listMatrix,
  moveStep,
  normalizedArgs,
  parseTransformList,
  removeStep,
  serializeSteps,
  setPivot,
  setStepArgs,
  stepMatrix,
  STEP_KINDS,
} from './transform-list';

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('transform list (design 009 E7)', () => {
  it('parses every function and writes unchanged steps back as written', () => {
    const text = 'translate(10,20) scale(2) rotate(30 5 5) skewX(10) skewY(-5) matrix(1 0 0 1 3 4)';
    const steps = parseTransformList(text)!;
    expect(steps.map((s) => s.kind)).toEqual([...STEP_KINDS]);
    expect(steps[0].args).toEqual([10, 20]);
    expect(steps[2].args).toEqual([30, 5, 5]);
    expect(serializeSteps(steps)).toBe(text);
    expect(parseTransformList('  rotate( 45 ) ,translate(1e1 .5)')!.map((s) => s.source)).toEqual([
      'rotate( 45 )',
      'translate(1e1 .5)',
    ]);
    expect(parseTransformList('')).toEqual([]);
    expect(parseTransformList(null)).toEqual([]);
    expect(parseTransformList('   ')).toEqual([]);
  });

  it('refuses invalid lists', () => {
    for (const bad of [
      'rotate(1 2)',
      'translate()',
      'matrix(1 2 3)',
      'skewX(1 2)',
      'perspective(3)',
      'translate(1) x',
      'translate(1,)',
      'translate(1,,2)',
      'translate(1),',
      'translate(a)',
      'translate(1',
    ]) {
      expect(parseTransformList(bad), bad).toBeNull();
    }
  });

  it('fills implied arguments and knows the pivot', () => {
    const [t, s, r] = parseTransformList('translate(3) scale(2) rotate(9)')!;
    expect(normalizedArgs(t)).toEqual([3, 0]);
    expect(normalizedArgs(s)).toEqual([2, 2]);
    expect(normalizedArgs(r)).toEqual([9, 0, 0]);
    expect(hasPivot(r)).toBe(false);
    expect(hasPivot(parseTransformList('rotate(9 1 2)')![0])).toBe(true);
  });

  it('matrix of the list = product of the steps (left first, like SVG)', () => {
    const steps = parseTransformList('translate(10 20) rotate(90 5 5) scale(2 3)')!;
    const m = listMatrix(steps);
    // a point goes through scale, then rotate about (5,5), then translate
    const p = { x: 1, y: 1 };
    const s = { x: 2, y: 3 };
    const r = { x: 5 - (s.y - 5), y: 5 + (s.x - 5) };
    const q = apply(m, p);
    close(q.x, r.x + 10);
    close(q.y, r.y + 20);
    const sk = stepMatrix({ kind: 'skewX', args: [45] });
    close(sk.c, 1);
    const sy = stepMatrix({ kind: 'skewY', args: [45] });
    close(sy.b, 1);
    expect(stepMatrix({ kind: 'matrix', args: [1, 2, 3, 4, 5, 6] })).toEqual({
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
    });
    expect(listMatrix([])).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  });

  it('adds neutral steps, removes and reorders', () => {
    let steps = parseTransformList('translate(1,2)')!;
    for (const k of STEP_KINDS) steps = addStep(steps, k);
    expect(serializeSteps(steps)).toBe(
      'translate(1,2) translate(0 0) scale(1 1) rotate(0) skewX(0) skewY(0) matrix(1 0 0 1 0 0)',
    );
    // neutral steps change nothing
    expect(listMatrix(steps)).toEqual(listMatrix(parseTransformList('translate(1 2)')!));
    steps = removeStep(steps, 1);
    expect(serializeSteps(steps).startsWith('translate(1,2) scale(1 1)')).toBe(true);
    const moved = moveStep(parseTransformList('translate(1) scale(2) rotate(3)')!, 0, 2);
    expect(serializeSteps(moved)).toBe('scale(2) rotate(3) translate(1)');
    expect(serializeSteps(moveStep(moved, 2, 0))).toBe('translate(1) scale(2) rotate(3)');
    expect(serializeSteps(moveStep(moved, 1, 99))).toBe('scale(2) translate(1) rotate(3)');
  });

  it('a changed step is written anew with rounded numbers, the rest keeps its text', () => {
    const steps = parseTransformList('translate(10,20)  rotate(30)')!;
    expect(serializeSteps(setStepArgs(steps, 1, [12.345678]))).toBe(
      'translate(10,20) rotate(12.3457)',
    );
    expect(displayNumber(1 / 3)).toBe('0.333');
    expect(displayNumber(-0.0001)).toBe('0');
  });

  it('Use pivot puts the centre of the element into the space of the rotate', () => {
    // rotate first, then a translate: the centre (10, 10) of the element is (60, 10) for the rotate
    const steps = parseTransformList('rotate(30) translate(50 0)')!;
    const on = setPivot(steps, 0, { x: 10, y: 10 });
    expect(serializeSteps(on)).toBe('rotate(30 60 10) translate(50 0)');
    // the centre stays where it was without rotation: it is the fixed point
    const m = listMatrix(on);
    const c = apply(m, { x: 10, y: 10 });
    const noRot = apply(listMatrix(parseTransformList('translate(50 0)')!), { x: 10, y: 10 });
    close(c.x, noRot.x);
    close(c.y, noRot.y);
    expect(serializeSteps(setPivot(on, 0, null))).toBe('rotate(30) translate(50 0)');
    // not a rotate: unchanged
    expect(setPivot(steps, 1, { x: 0, y: 0 })).toEqual(steps);
    // composition check: T(c)·R·T(−c)
    const r = stepMatrix({ kind: 'rotate', args: [90, 1, 0] });
    const viaParts = multiply(
      { a: 1, b: 0, c: 0, d: 1, e: 1, f: 0 },
      multiply(stepMatrix({ kind: 'rotate', args: [90] }), { a: 1, b: 0, c: 0, d: 1, e: -1, f: 0 }),
    );
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f'] as const) close(r[k], viaParts[k]);
  });
});
