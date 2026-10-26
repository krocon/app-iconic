/**
 * Serialisable arguments of actions (design 005 E3, AI rule of 26.10.2026): a small subset of JSON
 * Schema that the MCP server (prompt 018) can hand to the AI as it is. Arguments come from outside
 * and are checked before an action runs.
 */
export type ArgSpec =
  | { type: 'number'; minimum?: number; maximum?: number }
  | { type: 'integer'; minimum?: number; maximum?: number }
  | { type: 'string'; maxLength?: number; enum?: readonly string[] }
  | { type: 'boolean' }
  /** Any JSON value (checked further by the handler, e.g. a document command). */
  | { type: 'json' };

export interface ArgsSpec {
  type: 'object';
  properties: Record<string, ArgSpec>;
  required?: readonly string[];
}

const MAX_STRING = 4096;

function valueOk(spec: ArgSpec, v: unknown): boolean {
  switch (spec.type) {
    case 'number':
    case 'integer':
      return (
        typeof v === 'number' &&
        Number.isFinite(v) &&
        (spec.type === 'number' || Number.isInteger(v)) &&
        (spec.minimum === undefined || v >= spec.minimum) &&
        (spec.maximum === undefined || v <= spec.maximum)
      );
    case 'string':
      return (
        typeof v === 'string' &&
        v.length <= (spec.maxLength ?? MAX_STRING) &&
        (!spec.enum || spec.enum.includes(v))
      );
    case 'boolean':
      return typeof v === 'boolean';
    case 'json':
      return v !== undefined;
  }
}

/**
 * `args` fit `spec`: no arguments for an action without a spec; otherwise an object with the
 * required keys, only known keys, every value of its type.
 */
export function checkArgs(spec: ArgsSpec | undefined, args: unknown): boolean {
  if (!spec) return args === undefined;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return args === undefined && !spec.required?.length;
  }
  const o = args as Record<string, unknown>;
  for (const k of spec.required ?? []) if (!Object.hasOwn(o, k)) return false;
  return Object.entries(o).every(
    ([k, v]) => Object.hasOwn(spec.properties, k) && valueOk(spec.properties[k], v),
  );
}
