import { fmt } from '../../shared/geometry/align';
import { apply, Matrix } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';

/**
 * The transform list of the properties panel (design 009 E7, legacy §7.5 `TransformSection`):
 * the steps of a `transform` attribute – parse strictly, edit, write back. Unchanged steps keep
 * their text. The browser is the judge of what a transform means: the matrices come from
 * `transform.baseVal` (`transform-matrix.ts`, prompt 033 E3 – no own transform arithmetic here);
 * this file only edits the attribute text. Pure.
 */

export type StepKind = 'translate' | 'scale' | 'rotate' | 'skewX' | 'skewY' | 'matrix';

export const STEP_KINDS: readonly StepKind[] = [
  'translate',
  'scale',
  'rotate',
  'skewX',
  'skewY',
  'matrix',
];

export interface TransformStep {
  kind: StepKind;
  args: number[];
  /** The text as written – kept while the step is unchanged. */
  source?: string;
}

/** How many numbers each function takes. */
const ARITY: Record<StepKind, readonly number[]> = {
  translate: [1, 2],
  scale: [1, 2],
  rotate: [1, 3],
  skewX: [1],
  skewY: [1],
  matrix: [6],
};

/** A neutral step for "Add". */
const NEUTRAL: Record<StepKind, number[]> = {
  translate: [0, 0],
  scale: [1, 1],
  rotate: [0],
  skewX: [0],
  skewY: [0],
  matrix: [1, 0, 0, 1, 0, 0],
};

const NUM = String.raw`[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?`;
const FUNC = new RegExp(
  String.raw`\s*(translate|scale|rotate|skewX|skewY|matrix)\s*\(\s*((?:${NUM}(?:\s*,\s*|\s+)?)*)\)\s*,?`,
  'y',
);
const NUMS = new RegExp(NUM, 'g');

/**
 * The steps of `text`; `[]` for an empty attribute, `null` if `text` is not a valid transform list
 * (unknown function, wrong number of arguments, anything between the functions).
 */
export function parseTransformList(text: string | null | undefined): TransformStep[] | null {
  const s = text ?? '';
  const out: TransformStep[] = [];
  FUNC.lastIndex = 0;
  let at = 0;
  while (at < s.length) {
    if (/^\s*$/.test(s.slice(at))) break;
    FUNC.lastIndex = at;
    const m = FUNC.exec(s);
    if (!m) return null;
    const kind = m[1] as StepKind;
    if (/,\s*$/.test(m[2])) return null; // `translate(1,)`
    const args = (m[2].match(NUMS) ?? []).map(Number);
    if (!ARITY[kind].includes(args.length) || args.some((n) => !Number.isFinite(n))) return null;
    out.push({ kind, args, source: m[0].trim().replace(/,$/, '').trim() });
    at = FUNC.lastIndex;
  }
  // a trailing comma after the last function is not allowed
  if (/,\s*$/.test(s)) return null;
  return out;
}

/** The text of one step: as written if unchanged, else `name(a b c)` with `fmt` numbers. */
export function stepText(step: TransformStep): string {
  return step.source ?? `${step.kind}(${step.args.map(fmt).join(' ')})`;
}

export function serializeSteps(steps: readonly TransformStep[]): string {
  return steps.map(stepText).join(' ');
}

/** The arguments with the implied ones filled in (translate y = 0, scale y = x, pivot 0 0). */
export function normalizedArgs(step: TransformStep): number[] {
  const a = step.args;
  switch (step.kind) {
    case 'translate':
      return [a[0] ?? 0, a[1] ?? 0];
    case 'scale':
      return [a[0] ?? 1, a[1] ?? a[0] ?? 1];
    case 'rotate':
      return [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
    default:
      return [...a];
  }
}

export function hasPivot(step: TransformStep): boolean {
  return step.kind === 'rotate' && step.args.length === 3;
}

export function addStep(steps: readonly TransformStep[], kind: StepKind): TransformStep[] {
  return [...steps, { kind, args: [...NEUTRAL[kind]] }];
}

export function removeStep(steps: readonly TransformStep[], index: number): TransformStep[] {
  return steps.filter((_, i) => i !== index);
}

/** Moves step `from` so that it ends up at index `to` (clamped). */
export function moveStep(
  steps: readonly TransformStep[],
  from: number,
  to: number,
): TransformStep[] {
  if (from < 0 || from >= steps.length) return [...steps];
  const out = [...steps];
  const [s] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, s);
  return out;
}

/** New arguments for step `index` (its text is written anew). */
export function setStepArgs(
  steps: readonly TransformStep[],
  index: number,
  args: readonly number[],
): TransformStep[] {
  return steps.map((s, i) => (i === index ? { kind: s.kind, args: [...args] } : s));
}

/** The matrix of a list of steps – the browser's (`stepsMatrix` in `transform-matrix.ts`). */
export type StepsMatrix = (steps: readonly TransformStep[]) => Matrix;

/**
 * "Use pivot" of the rotate step `index`: on = `rotate(a cx cy)` around `center` (a point in the
 * element's own user space, e.g. its bbox centre), mapped through the steps after the rotate into
 * the space the rotate works in (`matrixOf`, the browser's matrix); off (`null`) = `rotate(a)`.
 */
export function setPivot(
  steps: readonly TransformStep[],
  index: number,
  center: Point | null,
  matrixOf: StepsMatrix,
): TransformStep[] {
  const s = steps[index];
  if (!s || s.kind !== 'rotate') return [...steps];
  const angle = normalizedArgs(s)[0];
  if (!center) return setStepArgs(steps, index, [angle]);
  const p = apply(matrixOf(steps.slice(index + 1)), center);
  return setStepArgs(steps, index, [angle, p.x, p.y]);
}

/** A number as shown in the panel: at most 3 decimals. */
export function displayNumber(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(r === 0 ? 0 : r);
}
