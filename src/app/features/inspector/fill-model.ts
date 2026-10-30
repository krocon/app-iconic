import { setIn } from '../document/model/icon-json';
import { DEFAULT_COLOR, isIconColor, shifted } from './icon-color-text';

/**
 * The fill editor's view of a `fill` value (design 010 E6) – background of the icon and colour of
 * a layer. Only a view: `writeFill(readFill(v))` is `v` again; changed parts are written back into
 * the original object in its key order. Shapes we do not know stay `unknown` (read-only). Pure.
 */

export type FillPreset = 'automatic' | 'system-light' | 'system-dark' | 'none';
export type FillKind =
  FillPreset | 'solid' | 'automatic-gradient' | 'linear-gradient' | 'radial-gradient' | 'unknown';

export interface UnitPoint {
  x: number;
  y: number;
}

export interface Orientation {
  start: UnitPoint;
  stop: UnitPoint;
}

export interface FillModel {
  kind: FillKind;
  /** Colour texts as in the file (solid / automatic-gradient: one). */
  colors: string[];
  /** Gradients: `orientation` of the file, `null` = none written (Icon Composer's default). */
  orientation: Orientation | null;
  /** The value read; parts not changed are kept from it. */
  raw: unknown;
}

export const PRESETS: readonly FillPreset[] = ['automatic', 'system-light', 'system-dark', 'none'];

/**
 * `radial-gradient` may be chosen in the editor (prompt 077 E5): not until an Icon Composer file
 * shows it – the unofficial schema forbids it, no evidence file has it (question to Marc). The
 * model can create, read and keep it already; the preview shows it.
 */
export const RADIAL_CREATABLE = false;

/** Kinds offered in the editor (design 010 E7, 077 E5). */
export const NEW_FILL_KINDS: readonly FillKind[] = [
  ...PRESETS,
  'solid',
  'automatic-gradient',
  'linear-gradient',
  ...(RADIAL_CREATABLE ? (['radial-gradient'] as const) : []),
];

/** Icon Composer's orientation of a new gradient (sample files: top centre → 70 % down). */
export const DEFAULT_ORIENTATION: Orientation = {
  start: { x: 0.5, y: 0 },
  stop: { x: 0.5, y: 0.7 },
};

const GRADIENTS = ['linear-gradient', 'radial-gradient'] as const;

function point(v: unknown): UnitPoint | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'x' && k !== 'y')) return null;
  return typeof o['x'] === 'number' && typeof o['y'] === 'number' ? { x: o['x'], y: o['y'] } : null;
}

function orientationOf(v: unknown): Orientation | null | undefined {
  if (v === undefined) return null;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'start' && k !== 'stop')) return undefined;
  const start = point(o['start']);
  const stop = point(o['stop']);
  return start && stop ? { start, stop } : undefined;
}

const unknown = (raw: unknown): FillModel => ({
  kind: 'unknown',
  colors: [],
  orientation: null,
  raw,
});

export function readFill(raw: unknown): FillModel {
  if (typeof raw === 'string') {
    return (PRESETS as readonly string[]).includes(raw)
      ? { kind: raw as FillPreset, colors: [], orientation: null, raw }
      : unknown(raw);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return unknown(raw);
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  for (const kind of ['solid', 'automatic-gradient'] as const) {
    if (keys.length === 1 && keys[0] === kind) {
      return isIconColor(o[kind])
        ? { kind, colors: [o[kind]], orientation: null, raw }
        : unknown(raw);
    }
  }
  for (const kind of GRADIENTS) {
    if (!(kind in o) || keys.some((k) => k !== kind && k !== 'orientation')) continue;
    const list = o[kind];
    const orientation = orientationOf(o['orientation']);
    if (
      !Array.isArray(list) ||
      list.length === 0 ||
      !list.every(isIconColor) ||
      orientation === undefined
    ) {
      return unknown(raw);
    }
    return { kind, colors: list as string[], orientation, raw };
  }
  return unknown(raw);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The value of `m`: for an unchanged model exactly `m.raw`. */
export function writeFill(m: FillModel): unknown {
  if (m.kind === 'unknown') return m.raw;
  if ((PRESETS as readonly string[]).includes(m.kind)) return m.kind;
  const raw = readFill(m.raw).kind === m.kind ? (m.raw as Record<string, unknown>) : null;
  if (m.kind === 'solid' || m.kind === 'automatic-gradient') {
    return raw ? setIn(raw, [m.kind], m.colors[0]) : { [m.kind]: m.colors[0] };
  }
  let out: Record<string, unknown> = raw ?? { [m.kind]: m.colors };
  if (raw && !same(raw[m.kind], m.colors)) out = setIn(out, [m.kind], m.colors);
  const old = raw ? orientationOf(raw['orientation']) : null;
  if (!same(old, m.orientation)) {
    out = setIn(out, ['orientation'], m.orientation ?? undefined);
  }
  return out;
}

/**
 * The model as another kind, colours carried over (design 010 E6). Gradients get two colours and
 * the orientation of the model or the evidence default – also `radial-gradient` (centre = start,
 * radius = distance to stop, as `fill-preview.ts` reads it; prompt 077 E5).
 */
export function switchKind(m: FillModel, kind: FillKind): FillModel {
  if (kind === m.kind || kind === 'unknown') return m;
  if ((PRESETS as readonly string[]).includes(kind)) {
    return { kind, colors: [], orientation: null, raw: kind };
  }
  const first = m.colors[0] ?? DEFAULT_COLOR;
  if (kind === 'solid' || kind === 'automatic-gradient') {
    return { kind, colors: [first], orientation: null, raw: null };
  }
  const colors = m.colors.length >= 2 ? m.colors.slice(0, 2) : [first, shifted(first, -0.14)];
  return { kind, colors, orientation: m.orientation ?? { ...DEFAULT_ORIENTATION }, raw: null };
}

/** `m` with colour `i` replaced. */
export function withColor(m: FillModel, i: number, color: string): FillModel {
  const colors = m.colors.slice();
  colors[i] = color;
  return { ...m, colors };
}

/** `m` with one coordinate of the orientation changed (missing orientation = the default). */
export function withOrientation(
  m: FillModel,
  end: 'start' | 'stop',
  axis: 'x' | 'y',
  value: number,
): FillModel {
  const o = m.orientation ?? DEFAULT_ORIENTATION;
  return { ...m, orientation: { ...o, [end]: { ...o[end], [axis]: value } } };
}

/** A fill value the KI may set (`icon.setFill`): any kind we can read. */
export function isValidFill(v: unknown): boolean {
  return readFill(v).kind !== 'unknown';
}
