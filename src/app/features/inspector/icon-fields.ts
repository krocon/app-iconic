import { IconItem } from '../document/model/selection';
import { JsonPath } from '../document/model/icon-json';
import { UndoLabel } from '../document/undo/undo-texts';

/**
 * The editable `icon.json` fields (design 010 E1 – only what the evidence files show) as specs,
 * like the property specs of 009: key (+ part of the value), kind, range, built-in default
 * (assumed, design question 4), undo name, section. Everything else is "Other properties". Pure.
 */

export type FieldTarget = IconItem['kind'];
export type FieldKind = 'fill' | 'number' | 'enum' | 'toggle' | 'asset' | 'blur';
export type FieldSection =
  | 'background'
  | 'identity'
  | 'appearance'
  | 'fill'
  | 'liquidGlass'
  | 'shadow'
  | 'translucency'
  | 'position';

export interface FieldDef {
  /** Unique per target; the AI names it (`icon.set { field }`). */
  id: string;
  key: string;
  /** Part of the value (`['opacity']` of `shadow`); `[]` = the whole value. */
  sub: JsonPath;
  kind: FieldKind;
  section: FieldSection;
  target: FieldTarget;
  /** Built-in value when the key is missing (only shown, never written by looking). */
  fallback: unknown;
  undo: UndoLabel;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
}

export const BLEND_MODES: readonly string[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'plus-darker',
  'plus-lighter',
];

const SHADOW = { kind: 'neutral', opacity: 0.5 };
const TRANSLUCENCY = { enabled: true, value: 0.5 };
const POSITION = { scale: 1, 'translation-in-points': [0, 0] };
const UNIT = { min: 0, max: 1, step: 0.01 };

function common(target: 'group' | 'layer'): FieldDef[] {
  const opacityUndo = target === 'group' ? 'changeGroupOpacity' : 'changeLayerOpacity';
  const appearance: FieldSection = target === 'group' ? 'appearance' : 'identity';
  const f = (d: Omit<FieldDef, 'target' | 'sub'> & { sub?: JsonPath }): FieldDef => ({
    sub: [],
    ...d,
    target,
  });
  return [
    f({
      id: 'hidden',
      key: 'hidden',
      kind: 'toggle',
      section: appearance,
      fallback: false,
      undo: 'toggleVisibility',
    }),
    f({
      id: 'opacity',
      key: 'opacity',
      kind: 'number',
      section: appearance,
      fallback: 1,
      undo: opacityUndo,
      ...UNIT,
    }),
    f({
      id: 'blend-mode',
      key: 'blend-mode',
      kind: 'enum',
      section: appearance,
      fallback: 'normal',
      undo: 'changeBlendMode',
      options: BLEND_MODES,
    }),
  ];
}

function position(target: 'group' | 'layer'): FieldDef[] {
  const base = {
    key: 'position',
    kind: 'number',
    section: 'position',
    target,
    fallback: POSITION,
    undo: 'changePosition',
  } as const;
  return [
    { ...base, id: 'position.scale', sub: ['scale'], min: 0.05, max: 3, step: 0.01 },
    { ...base, id: 'position.x', sub: ['translation-in-points', 0], step: 1 },
    { ...base, id: 'position.y', sub: ['translation-in-points', 1], step: 1 },
  ];
}

const GROUP: FieldDef[] = [
  ...common('group'),
  {
    id: 'lighting',
    key: 'lighting',
    sub: [],
    kind: 'enum',
    section: 'liquidGlass',
    target: 'group',
    fallback: 'combined',
    undo: 'changeLighting',
    options: ['combined', 'individual'],
  },
  {
    id: 'specular',
    key: 'specular',
    sub: [],
    kind: 'toggle',
    section: 'liquidGlass',
    target: 'group',
    fallback: true,
    undo: 'changeSpecular',
  },
  {
    id: 'blur-material',
    key: 'blur-material',
    sub: [],
    kind: 'blur',
    section: 'liquidGlass',
    target: 'group',
    fallback: null,
    undo: 'changeBlur',
    ...UNIT,
  },
  {
    id: 'shadow.kind',
    key: 'shadow',
    sub: ['kind'],
    kind: 'enum',
    section: 'shadow',
    target: 'group',
    fallback: SHADOW,
    undo: 'changeShadow',
    options: ['neutral', 'layer-color', 'none'],
  },
  {
    id: 'shadow.opacity',
    key: 'shadow',
    sub: ['opacity'],
    kind: 'number',
    section: 'shadow',
    target: 'group',
    fallback: SHADOW,
    undo: 'changeShadow',
    ...UNIT,
  },
  {
    id: 'translucency.enabled',
    key: 'translucency',
    sub: ['enabled'],
    kind: 'toggle',
    section: 'translucency',
    target: 'group',
    fallback: TRANSLUCENCY,
    undo: 'changeTranslucency',
  },
  {
    id: 'translucency.value',
    key: 'translucency',
    sub: ['value'],
    kind: 'number',
    section: 'translucency',
    target: 'group',
    fallback: TRANSLUCENCY,
    undo: 'changeTranslucency',
    ...UNIT,
  },
  ...position('group'),
];

const LAYER: FieldDef[] = [
  {
    id: 'image-name',
    key: 'image-name',
    sub: [],
    kind: 'asset',
    section: 'identity',
    target: 'layer',
    fallback: null,
    undo: 'changeLayerAsset',
  },
  ...common('layer'),
  {
    id: 'glass',
    key: 'glass',
    sub: [],
    kind: 'toggle',
    section: 'identity',
    target: 'layer',
    fallback: true,
    undo: 'changeGlass',
  },
  {
    id: 'fill',
    key: 'fill',
    sub: [],
    kind: 'fill',
    section: 'fill',
    target: 'layer',
    fallback: 'automatic',
    undo: 'changeLayerFill',
  },
  ...position('layer'),
];

const ROOT: FieldDef[] = [
  {
    id: 'background',
    key: 'fill',
    sub: [],
    kind: 'fill',
    section: 'background',
    target: 'root',
    fallback: 'automatic',
    undo: 'changeBackground',
  },
];

export const FIELDS: Readonly<Record<FieldTarget, readonly FieldDef[]>> = {
  root: ROOT,
  group: GROUP,
  layer: LAYER,
};

export function fieldDef(target: FieldTarget, id: string): FieldDef | undefined {
  return FIELDS[target].find((d) => d.id === id);
}

/** Keys the inspector shows itself; everything else is "Other properties (read-only)". */
export const KNOWN_KEYS: Readonly<Record<FieldTarget, ReadonlySet<string>>> = {
  root: new Set([
    'fill',
    'fill-specializations',
    'groups',
    'supported-platforms',
    'color-space-for-untagged-svg-colors',
  ]),
  group: new Set(['layers', 'name', ...GROUP.flatMap((d) => [d.key, `${d.key}-specializations`])]),
  layer: new Set(['name', ...LAYER.flatMap((d) => [d.key, `${d.key}-specializations`])]),
};

/** Colour spaces of untagged SVG colours (schema). */
export const COLOR_SPACES: readonly string[] = ['display-p3', 'srgb', 'extended-gray'];

/** Is `value` a value of `def` (typed by the inspector or sent by the AI)? */
export function validFieldValue(def: FieldDef, value: unknown): boolean {
  switch (def.kind) {
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        (def.min === undefined || value >= def.min) &&
        (def.max === undefined || value <= def.max)
      );
    case 'blur':
      return value === null || (typeof value === 'number' && value >= 0 && value <= 1);
    case 'toggle':
      return typeof value === 'boolean';
    case 'enum':
      return typeof value === 'string' && (def.options ?? []).includes(value);
    case 'asset':
      return typeof value === 'string' && value.length > 0 && value.length <= 255;
    case 'fill':
      return true; // checked by the fill model (`isValidFill`)
  }
}
