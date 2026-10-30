import { ActionGroup, ACTIONS } from '../../core/actions/action-catalog';
import { bindable, ChordMap, deviates, editable } from '../../core/actions/keymap-edit';
import { Os } from '../../core/actions/platform';
import { formatChord } from '../../core/actions/shortcut';
import { matches } from './command-palette';

const GROUP_ORDER: ActionGroup[] = ['file', 'edit', 'view', 'add', 'arrange', 'app', 'help'];

/** One line of the shortcut editor (design 085 E7). */
export interface ShortcutRowData {
  id: string;
  group: ActionGroup;
  label: string;
  /** Canonical chords (as in `keymap.json`). */
  chords: string[];
  /** The same as the OS shows them (`⌘⇧P`, `Ctrl+Shift+P`). */
  keys: string[];
  editable: boolean;
  /** The own OS keeps it in its menu (macOS Quit, Cut/Copy/Paste/Select All, design 085 E6). */
  fixed: boolean;
  /** Differs from the built-in shortcuts. */
  changed: boolean;
  /** First row of its group (heading). */
  first: boolean;
}

export interface RowQuery {
  /** The OS shown (the own one can be edited). */
  os: Os;
  editable: boolean;
  map: ChordMap;
  label: (id: string) => string;
  query: string;
  onlyChanged: boolean;
}

/** Without spaces, lower case: `⌘ ⇧ P` finds `⌘⇧P`, `ctrl+shift+p` finds `Ctrl+Shift+P`. */
function squeeze(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/**
 * The rows: every action a key can run (no required arguments), grouped by menu; filtered by name
 * and id (all words) or by a shortcut in the OS's notation or in the one of `keymap.json`. Pure.
 */
export function shortcutRows(q: RowQuery): ShortcutRowData[] {
  const all = [...ACTIONS]
    .filter(bindable)
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
    .map((def) => {
      const chords = q.map.get(def.id) ?? [];
      return {
        id: def.id,
        group: def.group,
        label: q.label(def.id),
        chords,
        keys: chords.map((c) => formatChord(c, q.os)),
        editable: q.editable && editable(q.os, def.id),
        fixed: q.editable && !editable(q.os, def.id),
        changed: deviates(q.map, q.os, def.id),
      };
    });
  const key = squeeze(q.query);
  const found = all.filter(
    (r) =>
      (!q.onlyChanged || r.changed) &&
      (!key ||
        matches(r, q.query) ||
        r.keys.some((k) => squeeze(k).includes(key)) ||
        r.chords.some((c) => squeeze(c).includes(key))),
  );
  return found.map((r, i) => ({ ...r, first: i === 0 || found[i - 1].group !== r.group }));
}
