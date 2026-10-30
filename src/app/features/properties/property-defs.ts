/**
 * The catalogue of property definitions (design 009 E1): editor type, unit, range, step and
 * default of every attribute the properties panel offers – data instead of a hand-written panel
 * (the template's `PropertySpec.swift`, values from legacy §7.4). Pure.
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
  /** An enum shown as icon toggles (prompt 073 E2): a picture per option. */
  icons?: Readonly<Record<string, { d: string; fill?: 'nonzero' | 'evenodd' }>>;
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

export const P = {
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
    icons: {
      nonzero: { d: 'M2 2h12v12H2z M5 5h6v6H5z', fill: 'nonzero' },
      evenodd: { d: 'M2 2h12v12H2z M5 5h6v6H5z', fill: 'evenodd' },
    },
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
    icons: {
      butt: { d: 'M1 5h9v6H1 M10 2v12' },
      round: { d: 'M1 5h9a3 3 0 0 1 0 6H1 M10 2v12' },
      square: { d: 'M1 5h12v6H1 M10 2v12' },
    },
  }),
  linejoin: def({
    name: 'stroke-linejoin',
    label: 'Line Join',
    type: 'enum',
    section: 'stroke',
    options: ['miter', 'round', 'bevel'],
    default: 'miter',
    icons: {
      miter: { d: 'M2 14L8 2l6 12' },
      round: { d: 'M2 14l5-9.5a1.2 1.2 0 0 1 2 0L14 14' },
      bevel: { d: 'M2 14l5-10h2l5 10' },
    },
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
    icons: {
      start: { d: 'M2.5 2v12 M2.5 6h11 M2.5 10h7' },
      middle: { d: 'M8 2v12 M2.5 6h11 M4.5 10h7' },
      end: { d: 'M13.5 2v12 M2.5 6h11 M6.5 10h7' },
    },
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
