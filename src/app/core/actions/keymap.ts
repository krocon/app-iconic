// Übernommen aus editlicious src/app/core/actions/keymap.ts (Prompt 005), Kontexte von AppIconic.
import base from './keymap.base.json';
import mac from './keymap.mac.json';
import other from './keymap.other.json';
import { actionDef, ActionContext } from './action-catalog';
import { Os } from './platform';
import { normalizeChord } from './shortcut';

type KeymapFile = Partial<Record<ActionContext, Record<string, string>>>;

export const CONTEXTS: readonly ActionContext[] = [
  'global',
  'drawing',
  'canvas',
  'hierarchy',
  'dialog',
];

/** The shortcuts in force: context → chord → action, and action → chords (design 005 E2). */
export interface Keymap {
  byContext: Record<ActionContext, Map<string, string>>;
  chords: Map<string, string[]>;
  /** Notes for the console: unknown actions, bad or conflicting chords. */
  notes: string[];
}

/** The keymap files of an OS: base first, then the OS file. */
export function keymapFiles(os: Os): KeymapFile[] {
  return [base as KeymapFile, (os === 'mac' ? mac : other) as KeymapFile];
}

/**
 * Base + OS keymap, then the user's overrides (`keymap.json`, design 005 E14): an action named
 * there gets exactly those chords (`[]` = none) in its own context; a chord taken by another
 * action of the same context moves to the overriding one. A chord must be in the context of its
 * action, and the OS file must not take a chord the base file gave to another action.
 */
export function buildKeymap(os: Os, overrides: Record<string, string[]> = {}): Keymap {
  const notes: string[] = [];
  const byContext = Object.fromEntries(
    CONTEXTS.map((c) => [c, new Map<string, string>()]),
  ) as Record<ActionContext, Map<string, string>>;
  for (const file of keymapFiles(os)) {
    for (const ctx of CONTEXTS) {
      for (const [chord, id] of Object.entries(file[ctx] ?? {})) {
        const c = normalizeChord(chord, os);
        const def = actionDef(id);
        if (!c || !def || def.context !== ctx) {
          notes.push(`keymap: ${chord} → ${id} ignored`);
          continue;
        }
        const taken = byContext[ctx].get(c);
        if (taken && taken !== id) notes.push(`keymap: ${chord} of ${taken} taken by ${id}`);
        byContext[ctx].set(c, id);
      }
    }
  }
  for (const [id, chords] of Object.entries(overrides)) {
    const def = actionDef(id);
    if (!def) {
      notes.push(`keymap.json: unknown action ${id}`);
      continue;
    }
    const map = byContext[def.context];
    for (const [c, a] of [...map]) if (a === id) map.delete(c);
    for (const chord of chords) {
      const c = normalizeChord(chord, os);
      if (c) map.set(c, id);
      else notes.push(`keymap.json: bad shortcut ${chord} for ${id}`);
    }
  }
  const chords = new Map<string, string[]>();
  for (const map of Object.values(byContext)) {
    for (const [c, id] of map) chords.set(id, [...(chords.get(id) ?? []), c]);
  }
  return { byContext, chords, notes };
}
