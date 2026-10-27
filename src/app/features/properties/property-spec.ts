/**
 * Property specs (design 009 E1): which attributes the properties panel offers for which SVG
 * element, with editor type, unit, range, step and default – data instead of a hand-written panel
 * (the template's `PropertySpec.swift` / `PropertySpecRegistry`, values from legacy §7.4). Pure.
 */

export type PropertyType = 'number' | 'length' | 'color' | 'enum' | 'text' | 'textarea' | 'toggle';

export type SectionId = 'geometry' | 'appearance' | 'stroke' | 'text' | 'transform' | 'advanced';

/** Order of the sections in the panel. */
export const SECTIONS: readonly SectionId[] = [
  'geometry',
  'appearance',
  'stroke',
  'text',
  'transform',
  'advanced',
];

export interface PropertyDef {
  /** Attribute name; `text` = the text content of `text` / `tspan`. */
  name: string;
  label: string;
  type: PropertyType;
  section: SectionId;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** The initial value (shown as placeholder; Reset falls back to it). */
  default?: string;
  options?: readonly string[];
  /** Toggle values (checked / unchecked). */
  on?: string;
  off?: string;
  /** Reset removes the attribute (false: the shape would vanish without it, design 009 E8). */
  reset: boolean;
}

type Def = Omit<PropertyDef, 'reset'> & { reset?: boolean };

const def = (d: Def): PropertyDef => ({ reset: true, ...d });

/** A length in user units (geometry). */
const len = (name: string, label: string, extra: Partial<Def> = {}): PropertyDef =>
  def({ name, label, type: 'length', section: 'geometry', step: 1, ...extra });

const ALIGN = ['xMin', 'xMid', 'xMax'].flatMap((x) => ['YMin', 'YMid', 'YMax'].map((y) => x + y));

export const PRESERVE_ASPECT_RATIO: readonly string[] = [
  'none',
  ...ALIGN.flatMap((a) => [`${a} meet`, `${a} slice`]),
];

const P = {
  // geometry (legacy §7.4)
  x: len('x', 'X'),
  y: len('y', 'Y'),
  width: len('width', 'Width', { min: 0, max: 10000, reset: false }),
  height: len('height', 'Height', { min: 0, max: 10000, reset: false }),
  rx: len('rx', 'Corner Radius X', { min: 0, max: 1000 }),
  ry: len('ry', 'Corner Radius Y', { min: 0, max: 1000 }),
  erx: len('rx', 'Radius X', { min: 0, max: 10000, reset: false }),
  ery: len('ry', 'Radius Y', { min: 0, max: 10000, reset: false }),
  cx: len('cx', 'Center X'),
  cy: len('cy', 'Center Y'),
  r: len('r', 'Radius', { min: 0, max: 10000, reset: false }),
  x1: len('x1', 'Start X'),
  y1: len('y1', 'Start Y'),
  x2: len('x2', 'End X'),
  y2: len('y2', 'End Y'),
  d: def({ name: 'd', label: 'Path Data', type: 'textarea', section: 'geometry', reset: false }),
  points: def({
    name: 'points',
    label: 'Points',
    type: 'textarea',
    section: 'geometry',
    reset: false,
  }),
  href: def({ name: 'href', label: 'Reference', type: 'text', section: 'geometry', reset: false }),
  viewBox: def({ name: 'viewBox', label: 'View Box', type: 'text', section: 'geometry' }),
  offset: def({
    name: 'offset',
    label: 'Offset',
    type: 'number',
    section: 'geometry',
    min: 0,
    max: 1,
    step: 0.01,
    default: '0',
  }),
  // appearance
  fill: def({
    name: 'fill',
    label: 'Fill',
    type: 'color',
    section: 'appearance',
    default: 'black',
  }),
  fillOpacity: def({
    name: 'fill-opacity',
    label: 'Fill Opacity',
    type: 'number',
    section: 'appearance',
    min: 0,
    max: 1,
    step: 0.01,
    default: '1',
  }),
  fillRule: def({
    name: 'fill-rule',
    label: 'Fill Rule',
    type: 'enum',
    section: 'appearance',
    options: ['nonzero', 'evenodd'],
    default: 'nonzero',
  }),
  opacity: def({
    name: 'opacity',
    label: 'Opacity',
    type: 'number',
    section: 'appearance',
    min: 0,
    max: 1,
    step: 0.01,
    default: '1',
  }),
  display: def({
    name: 'display',
    label: 'Display',
    type: 'enum',
    section: 'appearance',
    options: ['inline', 'block', 'none'],
    default: 'inline',
  }),
  visibility: def({
    name: 'visibility',
    label: 'Visibility',
    type: 'enum',
    section: 'appearance',
    options: ['visible', 'hidden', 'collapse'],
    default: 'visible',
  }),
  stopColor: def({
    name: 'stop-color',
    label: 'Stop Color',
    type: 'color',
    section: 'appearance',
    default: 'black',
  }),
  stopOpacity: def({
    name: 'stop-opacity',
    label: 'Stop Opacity',
    type: 'number',
    section: 'appearance',
    min: 0,
    max: 1,
    step: 0.01,
    default: '1',
  }),
  // stroke
  stroke: def({
    name: 'stroke',
    label: 'Stroke',
    type: 'color',
    section: 'stroke',
    default: 'none',
  }),
  strokeOpacity: def({
    name: 'stroke-opacity',
    label: 'Stroke Opacity',
    type: 'number',
    section: 'stroke',
    min: 0,
    max: 1,
    step: 0.01,
    default: '1',
  }),
  strokeWidth: def({
    name: 'stroke-width',
    label: 'Stroke Width',
    type: 'length',
    section: 'stroke',
    min: 0,
    max: 100,
    step: 1,
    default: '1',
  }),
  dasharray: def({
    name: 'stroke-dasharray',
    label: 'Dash Array',
    type: 'text',
    section: 'stroke',
    default: 'none',
  }),
  dashoffset: def({
    name: 'stroke-dashoffset',
    label: 'Dash Offset',
    type: 'length',
    section: 'stroke',
    step: 1,
    default: '0',
  }),
  linecap: def({
    name: 'stroke-linecap',
    label: 'Line Cap',
    type: 'enum',
    section: 'stroke',
    options: ['butt', 'round', 'square'],
    default: 'butt',
  }),
  linejoin: def({
    name: 'stroke-linejoin',
    label: 'Line Join',
    type: 'enum',
    section: 'stroke',
    options: ['miter', 'round', 'bevel'],
    default: 'miter',
  }),
  miterlimit: def({
    name: 'stroke-miterlimit',
    label: 'Miter Limit',
    type: 'number',
    section: 'stroke',
    min: 1,
    max: 100,
    step: 1,
    default: '4',
  }),
  vectorEffect: def({
    name: 'vector-effect',
    label: 'Non-scaling Stroke',
    type: 'toggle',
    section: 'stroke',
    on: 'non-scaling-stroke',
    off: 'none',
    default: 'none',
  }),
  // text
  text: def({ name: 'text', label: 'Content', type: 'text', section: 'text', reset: false }),
  fontSize: def({
    name: 'font-size',
    label: 'Font Size',
    type: 'length',
    section: 'text',
    unit: 'px',
    min: 4,
    max: 512,
    step: 1,
    default: '16',
  }),
  fontFamily: def({ name: 'font-family', label: 'Font Family', type: 'text', section: 'text' }),
  fontWeight: def({
    name: 'font-weight',
    label: 'Font Weight',
    type: 'enum',
    section: 'text',
    options: ['100', '200', '300', '400', '500', '600', '700', '800', '900', 'normal', 'bold'],
    default: '400',
  }),
  textAnchor: def({
    name: 'text-anchor',
    label: 'Anchor',
    type: 'enum',
    section: 'text',
    options: ['start', 'middle', 'end'],
    default: 'start',
  }),
  textDecoration: def({
    name: 'text-decoration',
    label: 'Decoration',
    type: 'text',
    section: 'text',
    default: 'none',
  }),
  // transform (edited by the transform list, design 009 E7)
  transform: def({ name: 'transform', label: 'Transform', type: 'text', section: 'transform' }),
  // advanced
  // removing an id would break `url(#id)` references: no reset
  id: def({ name: 'id', label: 'ID', type: 'text', section: 'advanced', reset: false }),
  filter: def({ name: 'filter', label: 'Filter', type: 'text', section: 'advanced' }),
  mask: def({ name: 'mask', label: 'Mask', type: 'text', section: 'advanced' }),
  par: def({
    name: 'preserveAspectRatio',
    label: 'Aspect Ratio',
    type: 'enum',
    section: 'advanced',
    options: PRESERVE_ASPECT_RATIO,
    default: 'xMidYMid meet',
  }),
} satisfies Record<string, PropertyDef>;

const APPEARANCE = [P.fill, P.fillOpacity, P.fillRule, P.opacity, P.display, P.visibility];
const STROKE = [
  P.stroke,
  P.strokeOpacity,
  P.strokeWidth,
  P.dasharray,
  P.dashoffset,
  P.linecap,
  P.linejoin,
  P.miterlimit,
  P.vectorEffect,
];
const TEXT = [P.fontSize, P.fontFamily, P.fontWeight, P.textAnchor, P.textDecoration];
const ADVANCED = [P.id, P.filter, P.mask];

/** Painted / containing elements: appearance, stroke, transform, advanced. */
const graphic = (geometry: PropertyDef[], extra: PropertyDef[] = []) => [
  ...geometry,
  ...APPEARANCE,
  ...STROKE,
  ...extra,
  P.transform,
  ...ADVANCED,
];

const SPECS: Record<string, readonly PropertyDef[]> = {
  rect: graphic([P.x, P.y, P.width, P.height, P.rx, P.ry]),
  circle: graphic([P.cx, P.cy, P.r]),
  ellipse: graphic([P.cx, P.cy, P.erx, P.ery]),
  line: graphic([P.x1, P.y1, P.x2, P.y2]),
  polyline: graphic([P.points]),
  polygon: graphic([P.points]),
  path: graphic([P.d]),
  text: graphic([P.x, P.y], [P.text, ...TEXT]),
  tspan: [P.x, P.y, ...APPEARANCE, ...STROKE, P.text, ...TEXT, ...ADVANCED],
  image: [
    P.x,
    P.y,
    P.width,
    P.height,
    P.opacity,
    P.display,
    P.visibility,
    P.transform,
    P.id,
    P.filter,
    P.mask,
    P.par,
  ],
  use: graphic([P.x, P.y, P.width, P.height, P.href]),
  svg: [
    P.x,
    P.y,
    P.width,
    P.height,
    P.viewBox,
    ...APPEARANCE,
    ...STROKE,
    P.id,
    P.filter,
    P.mask,
    P.par,
  ],
  g: graphic([]),
  a: graphic([]),
  switch: graphic([]),
  stop: [P.offset, P.stopColor, P.stopOpacity, P.id],
};

/** Not painted (definitions): only the id and friends. */
const OTHER: readonly PropertyDef[] = [P.id];

/** Every spec entry (for tests and the AI). */
export const ALL_PROPERTIES: readonly PropertyDef[] = Object.values(P);

/** The properties of an element (`localName`), in panel order. */
export function specFor(tag: string): readonly PropertyDef[] {
  return Object.hasOwn(SPECS, tag) ? SPECS[tag] : OTHER;
}

/** Tags with their own spec. */
export const SPEC_TAGS: readonly string[] = Object.keys(SPECS);

/**
 * The properties every one of `tags` has (design 009 E5): order and definition of the first.
 * Same name with another definition (`rx` of rect vs. ellipse) counts as common.
 */
export function commonSpec(tags: readonly string[]): PropertyDef[] {
  if (tags.length === 0) return [];
  const [first, ...rest] = tags.map((t) => specFor(t));
  return first.filter((d) => rest.every((s) => s.some((o) => o.name === d.name)));
}

/** `defs` grouped by section in panel order (empty sections left out). */
export function bySection(
  defs: readonly PropertyDef[],
): { section: SectionId; defs: PropertyDef[] }[] {
  return SECTIONS.map((section) => ({
    section,
    defs: defs.filter((d) => d.section === section),
  })).filter((s) => s.defs.length > 0);
}

/** Presentation attributes that are CSS properties too (a `style` may set them; computed values). */
const CSS = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'opacity',
  'display',
  'visibility',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'vector-effect',
  'font-size',
  'font-family',
  'font-weight',
  'text-anchor',
  'text-decoration',
  'filter',
  'mask',
  'stop-color',
  'stop-opacity',
]);

export function isCssProperty(name: string): boolean {
  return CSS.has(name);
}

/** Pairs of Constrain proportions (design 009 E6). */
export const CONSTRAIN_PAIRS: Readonly<Record<string, string>> = {
  width: 'height',
  height: 'width',
  rx: 'ry',
  ry: 'rx',
};
