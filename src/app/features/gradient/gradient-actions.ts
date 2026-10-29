import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { GradientKind, Paint } from './gradient-model';
import { GradientService } from './gradient.service';

interface Args {
  paint?: Paint;
  kind?: GradientKind;
  attributes?: unknown;
  offset?: number;
  color?: string;
  opacity?: number;
  index?: number;
}

/** Attribute names the AI may set on a gradient element (no ids, no hrefs, no events). */
const ATTRIBUTES = new Set([
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'fx',
  'fy',
  'fr',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
]);

/** Checked attributes: known names, string / number / `null` values. */
export function gradientAttributes(v: unknown): Record<string, string | null> | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const out: Record<string, string | null> = {};
  for (const [k, x] of Object.entries(v)) {
    if (!ATTRIBUTES.has(k)) return null;
    if (x === null) out[k] = null;
    else if (typeof x === 'number' && Number.isFinite(x)) out[k] = String(x);
    else if (typeof x === 'string' && x.length <= 512) out[k] = x;
    else return null;
  }
  return out;
}

/**
 * The actions of the gradient editor (prompt 032), all with serialisable arguments:
 * `gradient.create { kind?, paint? }`, `gradient.set { kind?, attributes?, paint? }`,
 * `gradient.addStop { offset, color? }`, `gradient.setStop { index, offset?, color?, opacity? }`,
 * `gradient.removeStop { index }`, `gradient.makeUnique`.
 */
export function registerGradientActions(
  actions: ActionService,
  gradient: GradientService,
  destroyRef?: DestroyRef,
): void {
  const args = (a: unknown) => (a ?? {}) as Args;
  const target = (a: unknown) => gradient.target(args(a).paint);
  const has = () => !!gradient.target();
  actions.registerAll(
    {
      'gradient.create': {
        run: (a) => gradient.create(args(a).kind ?? 'linear', args(a).paint ?? 'fill'),
        enabled: () => (gradient.store()?.selection().length ?? 0) === 1,
      },
      'gradient.set': {
        run: (a) => {
          const t = target(a);
          if (!t) return false;
          const { kind, attributes } = args(a);
          let done = false;
          if (attributes !== undefined) {
            const attrs = gradientAttributes(attributes);
            if (!attrs) return false;
            done = gradient.setAttributes(t, attrs);
          }
          if (kind) {
            const fresh = target(a);
            done = (fresh ? gradient.setKind(fresh, kind) : false) || done;
          }
          return done;
        },
        enabled: has,
      },
      'gradient.addStop': {
        run: (a) => {
          const t = target(a);
          const { offset, color } = args(a);
          return !!t && typeof offset === 'number' && gradient.addStop(t, offset, color);
        },
        enabled: has,
      },
      'gradient.setStop': {
        run: (a) => {
          const t = target(a);
          const { index, offset, color, opacity } = args(a);
          return (
            !!t && index !== undefined && gradient.setStop(t, index, { offset, color, opacity })
          );
        },
        enabled: has,
      },
      'gradient.removeStop': {
        run: (a) => {
          const t = target(a);
          const i = args(a).index;
          return !!t && i !== undefined && gradient.removeStop(t, i);
        },
        enabled: () => (gradient.target()?.info.stops.length ?? 0) > 2,
      },
      'gradient.editOnCanvas': {
        run: () => gradient.onCanvas.update((v) => !v),
        checked: () => gradient.onCanvas(),
      },
      'gradient.makeUnique': {
        run: (a) => {
          const t = target(a);
          return !!t && gradient.makeUnique(t);
        },
        enabled: () => (gradient.target()?.users ?? 0) > 1,
      },
    },
    destroyRef,
  );
}
