import {
  addStep,
  displayNumber,
  hasPivot,
  moveStep,
  normalizedArgs,
  parseTransformList,
  removeStep,
  serializeSteps,
  setPivot,
  setStepArgs,
  STEP_KINDS,
  StepsMatrix,
} from './transform-list';

/**
 * A stand-in for the browser's matrix (jsdom has no `SVGTransformList`): translations only. The
 * real matrices – products, skews, the pivot as fixed point – are checked in Playwright
 * (`e2e/properties.spec.ts`, prompt 033 E3).
 */
const translations: StepsMatrix = (steps) => {
  let e = 0;
  let f = 0;
  for (const s of steps) {
    if (s.kind !== 'translate') throw new Error(`stub: ${s.kind}`);
    e += s.args[0];
    f += s.args[1] ?? 0;
  }
  return { a: 1, b: 0, c: 0, d: 1, e, f };
};

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

  it('adds neutral steps, removes and reorders', () => {
    let steps = parseTransformList('translate(1,2)')!;
    for (const k of STEP_KINDS) steps = addStep(steps, k);
    expect(serializeSteps(steps)).toBe(
      'translate(1,2) translate(0 0) scale(1 1) rotate(0) skewX(0) skewY(0) matrix(1 0 0 1 0 0)',
    );
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
    const on = setPivot(steps, 0, { x: 10, y: 10 }, translations);
    expect(serializeSteps(on)).toBe('rotate(30 60 10) translate(50 0)');
    expect(serializeSteps(setPivot(on, 0, null, translations))).toBe('rotate(30) translate(50 0)');
    // not a rotate: unchanged
    expect(setPivot(steps, 1, { x: 0, y: 0 }, translations)).toEqual(steps);
  });
});
