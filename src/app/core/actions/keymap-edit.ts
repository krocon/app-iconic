import { KeymapChanges } from '../menu/menu.models';
import { ActionContext, ActionDef, actionDef, ACTIONS } from './action-catalog';
import { buildKeymap, Keymap } from './keymap';
import { Os } from './platform';
import { FIXED_ACTIONS_MAC, Reservation, reservation } from './reserved-shortcuts';

/**
 * The shortcut editor's model (design 085 E1/E5), pure: the shortcuts in force per action, edits
 * on them (assign with conflicts, remove, reset) and the deviations from the built-in keymaps that
 * go to `keymap.json`. Rebuilding with `buildKeymap(os, deviations(map, os))` gives the same map.
 */

/** Action id → its chords (canonical, first = the one menus show). */
export type ChordMap = Map<string, string[]>;

export function chordMap(k: Keymap): ChordMap {
  return new Map([...k.chords].map(([id, c]) => [id, [...c]]));
}

const DEFAULTS = new Map<Os, ChordMap>();

/** The built-in shortcuts of an OS (base + OS keymap, no `keymap.json`). */
export function defaults(os: Os): ChordMap {
  let d = DEFAULTS.get(os);
  if (!d) {
    d = chordMap(buildKeymap(os));
    DEFAULTS.set(os, d);
  }
  return d;
}

function clone(map: ChordMap): ChordMap {
  return new Map([...map].map(([id, c]) => [id, [...c]]));
}

/** Which contexts can be active together (`key-contexts.ts`, design 005 E4). */
const TOGETHER: readonly (readonly ActionContext[])[] = [
  ['dialog'],
  ['global'],
  ['hierarchy', 'global'],
  ['drawing', 'canvas', 'global'],
];

/** A key in context `a` and one in `b` can meet. */
export function overlaps(a: ActionContext, b: ActionContext): boolean {
  return TOGETHER.some((l) => l.includes(a) && l.includes(b));
}

/** A shortcut can run the action: no required arguments (`settings.set`, `edit.runCommand` …). */
export function bindable(def: ActionDef): boolean {
  return !def.args?.required?.length;
}

/** Its shortcuts may be changed on this OS (design 085 E6). */
export function editable(os: Os, id: string): boolean {
  const def = actionDef(id);
  return !!def && bindable(def) && !(os === 'mac' && FIXED_ACTIONS_MAC.has(id));
}

/**
 * Other actions holding `chord` where `id` could meet them. An overlap both have built in (Esc
 * deselects globally, the canvas has its own) is no conflict.
 */
export function conflicts(map: ChordMap, os: Os, id: string, chord: string): string[] {
  const def = actionDef(id);
  if (!def) return [];
  const builtIn = defaults(os);
  const mineByDefault = builtIn.get(id)?.includes(chord) ?? false;
  const out: string[] = [];
  for (const [other, chords] of map) {
    if (other === id || !chords.includes(chord)) continue;
    const o = actionDef(other);
    if (!o || !overlaps(def.context, o.context)) continue;
    if (mineByDefault && builtIn.get(other)?.includes(chord)) continue;
    out.push(other);
  }
  return out;
}

export type Resolution = 'replace' | 'swap';

export interface Assignment {
  id: string;
  chord: string;
  /** The chord it takes the place of; none = an additional one. */
  old?: string | null;
  /** What to do with other actions holding `chord`; none = report the conflict. */
  resolution?: Resolution;
}

export type AssignFailure = 'unknown' | 'fixed' | 'blocked' | 'conflict' | 'swap';

export type AssignResult =
  | { ok: true; map: ChordMap; warning: Reservation | null }
  | { ok: false; reason: AssignFailure; conflicts?: string[]; reservation?: Reservation };

/**
 * Gives `id` the shortcut `chord` (design 085 E5). A conflict without `resolution` is reported;
 * `replace` takes the chord from the others, `swap` gives the one other action `old` instead
 * (only if that does not clash or is blocked there).
 */
export function assign(map: ChordMap, os: Os, a: Assignment): AssignResult {
  const def = actionDef(a.id);
  if (!def || !bindable(def)) return { ok: false, reason: 'unknown' };
  if (!editable(os, a.id)) return { ok: false, reason: 'fixed' };
  const r = reservation(os, a.chord, a.id);
  if (r?.level === 'blocked') return { ok: false, reason: 'blocked', reservation: r };
  const warning = r;
  // the same shortcut pressed again: nothing to do
  if (a.old === a.chord && (map.get(a.id) ?? []).includes(a.chord)) {
    return { ok: true, map: clone(map), warning };
  }
  const old = a.old ?? null;
  const others = conflicts(map, os, a.id, a.chord);
  if (others.length && !a.resolution) return { ok: false, reason: 'conflict', conflicts: others };
  const next = clone(map);
  const mine = (next.get(a.id) ?? []).filter((c) => c !== a.chord);
  const at = old ? mine.indexOf(old) : -1;
  if (at >= 0) mine.splice(at, 1, a.chord);
  else mine.push(a.chord);
  next.set(a.id, mine);
  if (others.length && a.resolution === 'swap') {
    const [other] = others;
    if (others.length !== 1 || !old || at < 0 || !editable(os, other)) {
      return { ok: false, reason: 'swap', conflicts: others };
    }
    if (reservation(os, old, other)?.level === 'blocked') {
      return { ok: false, reason: 'swap', conflicts: others };
    }
    next.set(
      other,
      (next.get(other) ?? []).map((c) => (c === a.chord ? old : c)),
    );
    if (conflicts(next, os, other, old).length) {
      return { ok: false, reason: 'swap', conflicts: others };
    }
  } else {
    for (const o of others)
      next.set(
        o,
        (next.get(o) ?? []).filter((c) => c !== a.chord),
      );
  }
  return { ok: true, map: next, warning };
}

/** Without that one shortcut. */
export function removeChord(map: ChordMap, id: string, chord: string): ChordMap {
  const next = clone(map);
  next.set(
    id,
    (next.get(id) ?? []).filter((c) => c !== chord),
  );
  return next;
}

/**
 * Exactly these shortcuts for `id` (`keymap.set`, reset): others lose them; `null` if one is
 * blocked or the action cannot be changed.
 */
export function setChords(
  map: ChordMap,
  os: Os,
  id: string,
  chords: readonly string[],
): ChordMap | null {
  if (!editable(os, id)) return null;
  let next = clone(map);
  next.set(id, []);
  for (const chord of chords) {
    const r = assign(next, os, { id, chord, resolution: 'replace' });
    if (!r.ok) return null;
    next = r.map;
  }
  return next;
}

/** Back to the built-in shortcuts of `id` (others that took one meanwhile lose it). */
export function resetAction(map: ChordMap, os: Os, id: string): ChordMap {
  return setChords(map, os, id, defaults(os).get(id) ?? []) ?? clone(map);
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((c) => b.includes(c));
}

/** The action's shortcuts differ from the built-in ones. */
export function deviates(map: ChordMap, os: Os, id: string): boolean {
  return !same(map.get(id) ?? [], defaults(os).get(id) ?? []);
}

/** What `keymap.json` has to say: every action whose shortcuts differ (design 085 E1). */
export function deviations(map: ChordMap, os: Os): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const def of ACTIONS) {
    if (deviates(map, os, def.id)) out[def.id] = [...(map.get(def.id) ?? [])];
  }
  return out;
}

/** The patch for Rust `save_keymap`: every catalogue action, `null` = built-in (no entry). */
export function changesFor(map: ChordMap, os: Os): KeymapChanges {
  const dev = deviations(map, os);
  const out: KeymapChanges = {};
  for (const def of ACTIONS) out[def.id] = dev[def.id] ?? null;
  return out;
}
