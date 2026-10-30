import { Matrix } from '../../shared/geometry/matrix';
import { SVG_NS } from '../document/svg/node-ids';
import { serializeSteps, TransformStep } from './transform-list';

/**
 * The matrix of transform steps as the browser computes it (prompt 033 E3, review 031 finding
 * 11; CLAUDE.md §4 "no own transform chain"): the steps are written into the `transform` of a
 * detached `<g>` and `transform.baseVal.consolidate()` multiplies them. `doc` = the document that
 * creates the element (default: the page). Needs a browser – tested in Playwright
 * (`e2e/properties.spec.ts`); jsdom has no `SVGTransformList`.
 */
export function stepsMatrix(steps: readonly TransformStep[], doc: Document = document): Matrix {
  const g = doc.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('transform', serializeSteps(steps));
  const m = g.transform?.baseVal.consolidate()?.matrix;
  return m
    ? { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f }
    : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}
