import { PNG_SIZES } from '../export/export.models';
import {
  DEFAULT_SETTINGS,
  DrawStyle,
  MAX_PALETTE_COLORS,
  MAX_RECENT_COLORS,
  PANEL_MAX,
  PANEL_MIN,
  SCHEMA_VERSION,
  Settings,
  SettingsPatch,
  STYLE_KINDS,
  StyleKind,
  THIN_LINE,
} from './settings.models';

/**
 * The rules of `settings.json` in TS (design 015 E2/E11) – mirror of Rust `ai-core::settings`
 * (`merge`, `sanitize`, `apply_patch`; same cases in `testdata/settings-cases.json`). The store
 * applies a change at once with them, before Rust stores it; the fake backend uses them too.
 * Pure.
 */

type Json = unknown;

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const isInt = (v: Json) => typeof v === 'number' && Number.isInteger(v) && v >= 0;
/** Number fields that take fractions (`f64` in Rust; every other number is an integer). */
const FRACTIONAL = new Set(['canvas.zoom', 'freehand.epsilon']);

/** Same kind of value; an integer field takes only non-negative integers. */
function sameKind(shape: Json, input: Json, path: string): boolean {
  if (typeof shape === 'boolean' || typeof shape === 'string') return typeof input === typeof shape;
  if (typeof shape === 'number') {
    return (
      typeof input === 'number' && Number.isFinite(input) && (FRACTIONAL.has(path) || isInt(input))
    );
  }
  return false;
}

/** `input` over `base`, kinds from `shape` (Rust `merge_shaped`). */
export function mergeShaped(shape: Json, base: Json, input: Json, path = ''): Json {
  if (isObject(shape)) {
    if (!isObject(input)) return base;
    const b = isObject(base) ? base : shape;
    return Object.fromEntries(
      Object.keys(shape).map((k) => [
        k,
        k in input
          ? mergeShaped(shape[k], b[k] ?? shape[k], input[k], path ? `${path}.${k}` : k)
          : (b[k] ?? shape[k]),
      ]),
    );
  }
  if (Array.isArray(shape)) {
    if (!Array.isArray(input)) return base;
    const first = shape[0];
    // an empty default list holds texts (the colours of prompt 074; Rust the same)
    return first === undefined
      ? input.filter((x) => typeof x === 'string')
      : input.filter((x) => sameKind(first, x, `${path}[]`));
  }
  if (shape === null) return input === null || typeof input === 'string' ? input : base;
  return sameKind(shape, input, path) ? input : base;
}

function oneOf<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const MASKS = ['none', 'squircle', 'circle'] as const;
const CHOICES = ['system', 'light', 'dark'] as const;

const MAX_STYLE_VALUE = 128;

/**
 * A style value that may be written as an attribute (design 019 E13; Rust `style_value_ok`):
 * short, no markup or CSS syntax, no control characters, no `url(` (a reference into another asset).
 */
export function styleValueOk(v: string): boolean {
  return (
    [...v].length <= MAX_STYLE_VALUE &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f-\u009f<>"'`;{}\\]/.test(v) &&
    !v.toLowerCase().includes('url(')
  );
}

/** `#RGB…` → `#RRGGBB(AA)` upper case, opaque alpha left out (Rust `hex_color`); else `null`. */
export function hexColor(v: string): string | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v);
  if (!m) return null;
  let h = m[1].toUpperCase();
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  return `#${h.length === 8 && h.endsWith('FF') ? h.slice(0, 6) : h}`;
}

function colorList(list: readonly string[], max: number): string[] {
  const out: string[] = [];
  for (const v of list) {
    const c = hexColor(v);
    if (c && !out.includes(c)) out.push(c);
    if (out.length === max) break;
  }
  return out;
}

function sanitizeStyle(st: DrawStyle): DrawStyle {
  const out = { ...st };
  for (const k of Object.keys(THIN_LINE) as (keyof DrawStyle)[]) {
    if (!styleValueOk(out[k])) out[k] = THIN_LINE[k];
  }
  return out;
}

/** Clamps and checks every field (Rust `sanitize`). */
export function sanitizeSettings(s: Settings): Settings {
  const d = DEFAULT_SETTINGS;
  const c = s.canvas;
  const e = s.export;
  const panel = (p: Settings['panels']['commands']) => ({
    visible: p.visible,
    width: clamp(p.width, PANEL_MIN, PANEL_MAX),
  });
  const appearances = (['light', 'dark', 'tinted'] as const).filter((a) =>
    e.appearances.includes(a),
  );
  const sizes = PNG_SIZES.filter((n) => e.sizes.includes(n));
  const platforms = (['ios', 'macos', 'watchos'] as const).filter((p) =>
    (e.platforms as readonly string[]).includes(p),
  );
  const dir = e.targetDir;
  return {
    schemaVersion: SCHEMA_VERSION,
    theme: oneOf(s.theme, CHOICES, d.theme),
    language: oneOf(s.language, ['system', 'en', 'de'], d.language),
    panels: {
      commands: panel(s.panels.commands),
      hierarchy: panel(s.panels.hierarchy),
      properties: panel(s.panels.properties),
    },
    canvas: {
      ...c,
      gridSize: clamp(c.gridSize, 1, 256),
      guideTemplate: oneOf(c.guideTemplate, ['apple', 'material', 'grid'], d.canvas.guideTemplate),
      guideDivisions: clamp(c.guideDivisions, 2, 64),
      gridOrigin: oneOf(c.gridOrigin, ['worldZero', 'svgCenter'], d.canvas.gridOrigin),
      selectionMode: oneOf(c.selectionMode, ['point', 'boxed', 'none'], d.canvas.selectionMode),
      zoom: !Number.isFinite(c.zoom) || c.zoom <= 0 ? 0 : clamp(c.zoom, 0.25, 2),
      appearance: oneOf(c.appearance, CHOICES, d.canvas.appearance),
      mask: oneOf(c.mask, MASKS, d.canvas.mask),
    },
    export: {
      format: oneOf(e.format, ['png', 'svg', 'appiconset', 'icns', 'ico'], d.export.format),
      appearances: appearances.length ? appearances : [...d.export.appearances],
      sizes: sizes.length ? sizes : [...d.export.sizes],
      mask: oneOf(e.mask, MASKS, d.export.mask),
      effects: e.effects,
      targetDir: dir && dir.length <= 4096 && !dir.includes('\0') ? dir : null,
      platforms: platforms.length ? platforms : [...d.export.platforms],
    },
    freehand: {
      epsilon: Number.isFinite(s.freehand.epsilon)
        ? clamp(s.freehand.epsilon, 0, 20)
        : d.freehand.epsilon,
      strokeWidth: clamp(s.freehand.strokeWidth, 1, 64),
      closed: s.freehand.closed,
    },
    debug: { logUndoGrouping: s.debug.logUndoGrouping },
    mcp: { enabled: s.mcp.enabled, confirmFiles: s.mcp.confirmFiles },
    constraints: { autoSolve: s.constraints.autoSolve },
    sidebar: { constructionOpen: s.sidebar.constructionOpen },
    drawing: {
      styles: Object.fromEntries(
        STYLE_KINDS.map((k) => [k, sanitizeStyle(s.drawing.styles[k])]),
      ) as Record<StyleKind, DrawStyle>,
    },
    colors: {
      recent: colorList(s.colors.recent, MAX_RECENT_COLORS),
      palette: colorList(s.colors.palette, MAX_PALETTE_COLORS),
    },
  };
}

/** Settings from any JSON value (a file, a fake's storage): lay over the defaults, sanitize. */
export function settingsFromJson(v: Json): Settings {
  return sanitizeSettings(mergeShaped(DEFAULT_SETTINGS, DEFAULT_SETTINGS, v) as Settings);
}

/** `patch` laid over `current` (Rust `apply_patch`). */
export function applyPatch(current: Settings, patch: SettingsPatch | Json): Settings {
  return sanitizeSettings(mergeShaped(DEFAULT_SETTINGS, current, patch) as Settings);
}

/** Two patches as one (later wins; lists replace). */
export function joinPatches(a: SettingsPatch, b: SettingsPatch): SettingsPatch {
  const join = (x: Json, y: Json): Json =>
    isObject(x) && isObject(y)
      ? Object.fromEntries(
          [...new Set([...Object.keys(x), ...Object.keys(y)])].map((k) => [
            k,
            k in y ? join(x[k], y[k]) : x[k],
          ]),
        )
      : y;
  return join(a, b) as SettingsPatch;
}

/** The leaves of the settings as paths (`canvas.rulers`, `export.sizes`) – the keys of `settings.set`. */
export const SETTING_KEYS: readonly string[] = (() => {
  const out: string[] = [];
  const walk = (v: Json, path: string) => {
    if (isObject(v)) for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    else if (path !== 'schemaVersion') out.push(path);
  };
  walk(DEFAULT_SETTINGS, '');
  return out;
})();

export function valueAt(s: Settings, key: string): Json {
  return key.split('.').reduce<Json>((v, k) => (isObject(v) ? v[k] : undefined), s);
}

/** `{ canvas: { rulers: value } }` for `canvas.rulers`; `null` for an unknown key. */
export function patchFor(key: string, value: Json): SettingsPatch | null {
  if (!SETTING_KEYS.includes(key)) return null;
  return key.split('.').reduceRight<Json>((v, k) => ({ [k]: v }), value) as SettingsPatch;
}

/** A value of the kind of the leaf `shape` (lists: any list – the elements are filtered). */
function accepts(shape: Json, value: Json, path: string): boolean {
  if (Array.isArray(shape)) return Array.isArray(value);
  if (shape === null) return value === null || typeof value === 'string';
  return sameKind(shape, value, path);
}

/** The value `key` gets from `value` (merged and clamped); `null` = not accepted. */
export function checkedValue(current: Settings, key: string, value: Json): Json | null {
  const patch = patchFor(key, value);
  if (!patch || !accepts(valueAt(DEFAULT_SETTINGS, key), value, key)) return null;
  return valueAt(applyPatch(current, patch), key);
}
