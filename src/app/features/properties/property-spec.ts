import { P, PropertyDef, SECTIONS, SectionId } from './property-defs';

export type { PropertyDef, PropertyType, SectionId } from './property-defs';
export { PRESERVE_ASPECT_RATIO, SECTIONS } from './property-defs';

/**
 * Property specs (design 009 E1): which attributes the properties panel offers for which SVG
 * element (the template's `PropertySpecRegistry.propertiesForNodeType`). Pure.
 */

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
