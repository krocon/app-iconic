import { IconGroup, IconJson, IconLayer } from '../../../core/icon-file/icon-file.models';

/**
 * Reading and changing `icon.json` without touching what we do not know (design 003 E1). The
 * value is never changed in place: every helper returns a new object that shares the untouched
 * parts and keeps the key order (a replaced key stays where it was).
 */

/** Keys of objects and indices of arrays from the root, e.g. `['groups', 0, 'shadow', 'opacity']`. */
export type JsonPath = readonly (string | number)[];

type Container = Record<string, unknown> | unknown[];

function isContainer(v: unknown): v is Container {
  return typeof v === 'object' && v !== null;
}

/** The value at `path`, `undefined` if any step is missing. */
export function getIn(root: unknown, path: JsonPath): unknown {
  let v = root;
  for (const k of path) {
    if (!isContainer(v)) return undefined;
    v = Array.isArray(v)
      ? typeof k === 'number'
        ? v[k]
        : undefined
      : Object.prototype.hasOwnProperty.call(v, k)
        ? (v as Record<string, unknown>)[k]
        : undefined;
  }
  return v;
}

/** A copy of one container with `key` set (`undefined` removes an object key). */
function withKey(c: Container, key: string | number, value: unknown): Container {
  if (Array.isArray(c)) {
    if (typeof key !== 'number' || key < 0 || key > c.length) {
      throw new RangeError(`index ${String(key)} outside the array`);
    }
    const copy = c.slice();
    copy[key] = value;
    return copy;
  }
  const copy: Record<string, unknown> = {};
  let seen = false;
  for (const [k, v] of Object.entries(c)) {
    if (k === String(key)) {
      seen = true;
      if (value !== undefined) copy[k] = value;
    } else {
      copy[k] = v;
    }
  }
  if (!seen && value !== undefined) copy[String(key)] = value;
  return copy;
}

function update(root: unknown, path: JsonPath, f: (old: unknown) => unknown): unknown {
  if (path.length === 0) return f(root);
  const [head, ...rest] = path;
  const c: Container = isContainer(root) ? root : typeof head === 'number' ? [] : {};
  const child = getIn(c, [head]);
  return withKey(c, head, update(child, rest, f));
}

/** `root` with `value` at `path` (missing objects on the way are created). */
export function setIn<T>(root: T, path: JsonPath, value: unknown): T {
  return update(root, path, () => value) as T;
}

/** `root` without the key / array element at `path`. */
export function removeIn<T>(root: T, path: JsonPath): T {
  if (path.length === 0) throw new RangeError('cannot remove the root');
  const parent = path.slice(0, -1);
  const last = path[path.length - 1];
  if (getIn(root, path) === undefined) return root;
  return update(root, parent, (c) => {
    if (Array.isArray(c) && typeof last === 'number') return c.filter((_, i) => i !== last);
    return isContainer(c) ? withKey(c, last, undefined) : c;
  }) as T;
}

/** `root` with `value` inserted into the array at `path` before `index` (array created if missing). */
export function insertAt<T>(root: T, path: JsonPath, index: number, value: unknown): T {
  return update(root, path, (a) => {
    const arr = Array.isArray(a) ? a.slice() : [];
    if (index < 0 || index > arr.length) throw new RangeError(`index ${index} outside the array`);
    arr.splice(index, 0, value);
    return arr;
  }) as T;
}

/** `root` with the array element `from` moved to `to` (index in the result). */
export function moveAt<T>(root: T, path: JsonPath, from: number, to: number): T {
  return update(root, path, (a) => {
    if (!Array.isArray(a) || from < 0 || from >= a.length || to < 0 || to >= a.length) {
      throw new RangeError(`cannot move ${from} → ${to}`);
    }
    const arr = a.slice();
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    return arr;
  }) as T;
}

/** Typed reading of the known parts (unknown fields stay untouched in the value). */
export function groups(icon: IconJson): IconGroup[] {
  return Array.isArray(icon.groups) ? icon.groups : [];
}

export function layers(group: IconGroup | undefined): IconLayer[] {
  return Array.isArray(group?.layers) ? group.layers : [];
}

/** Every layer name of the document (for unique names). */
export function layerNames(icon: IconJson): string[] {
  return groups(icon).flatMap((g) =>
    layers(g).flatMap((l) => (typeof l.name === 'string' ? [l.name] : [])),
  );
}

/** A new group as Icon Composer writes it (design 002 E13, 003 E15), keys sorted. */
export function newGroup(layer: IconLayer): IconGroup {
  return {
    layers: [layer],
    shadow: { kind: 'neutral', opacity: 0.5 },
    translucency: { enabled: true, value: 0.5 },
  };
}

/** A new layer, keys sorted like Icon Composer. */
export function newLayer(imageName: string, name: string): IconLayer {
  return { 'image-name': imageName, name };
}
