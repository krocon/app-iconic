import { NodeRef } from '../document/icon-document';
import { fmt } from '../../shared/geometry/align';
import { GEOMETRY, PAINT, RENAMED, ShapeKind } from '../../core/actions/add-action-args';
import { ElementSpec } from './element-defaults';

/**
 * Applies the arguments of the "Add" actions (design 008 E6; schema in
 * `core/actions/add-action-args.ts`) to the defaults. The action service has checked the types
 * (`checkArgs`); names of free attributes and the parent ref are checked here.
 */

const ATTR_NAME = /^[A-Za-z_][\w.-]*(:[A-Za-z_][\w.-]*)?$/;
const MAX_ATTRIBUTES = 64;

/** An attribute name a caller may set (as `setAttribute` allows, design 003 E4). */
export function allowedAttribute(name: string): boolean {
  return ATTR_NAME.test(name) && !/^on/i.test(name) && !name.startsWith('data-ai-');
}

/** `attributes` from outside: an object of at most 64 allowed names with text values. */
function freeAttributes(v: unknown): Record<string, string> | null {
  if (v === undefined) return {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > MAX_ATTRIBUTES) return null;
  const out: Record<string, string> = {};
  for (const [k, value] of entries) {
    if (!allowedAttribute(k) || typeof value !== 'string' || value.length > 4096) return null;
    out[k] = value;
  }
  return out;
}

/** A NodeRef from outside (`parent`), `undefined` if not given, `null` if malformed. */
export function parseRef(v: unknown): NodeRef | null | undefined {
  if (v === undefined) return undefined;
  const o = v as Record<string, unknown> | null;
  if (
    typeof o !== 'object' ||
    o === null ||
    Object.keys(o).length !== 2 ||
    typeof o['asset'] !== 'string' ||
    typeof o['id'] !== 'string' ||
    !/^n\d+$/.test(o['id'])
  ) {
    return null;
  }
  return { asset: o['asset'], id: o['id'] };
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The defaults `base` with the caller's arguments applied; `null` if an argument is not allowed.
 * A rect given only a size stays centred where the default was.
 */
export function applyShapeArgs(
  kind: ShapeKind,
  base: ElementSpec,
  args: Record<string, unknown> | undefined,
): ElementSpec | null {
  if (!args) return base;
  const free = freeAttributes(args['attributes']);
  if (!free) return null;
  const attrs = { ...base.attrs };
  let text = base.text;
  if (kind === 'rect') {
    const cx = parseFloat(attrs['x']) + parseFloat(attrs['width']) / 2;
    const cy = parseFloat(attrs['y']) + parseFloat(attrs['height']) / 2;
    if (num(args['width']) && !num(args['x'])) attrs['x'] = fmt(cx - args['width'] / 2);
    if (num(args['height']) && !num(args['y'])) attrs['y'] = fmt(cy - args['height'] / 2);
  }
  const known = { ...GEOMETRY[kind], ...PAINT };
  for (const [k, v] of Object.entries(args)) {
    if (k === 'attributes' || k === 'parent' || k === 'index' || !Object.hasOwn(known, k)) continue;
    if (k === 'text') text = String(v);
    else attrs[RENAMED[k] ?? k] = num(v) ? fmt(v) : String(v);
  }
  return { tag: base.tag, attrs: { ...attrs, ...free }, ...(text === undefined ? {} : { text }) };
}
