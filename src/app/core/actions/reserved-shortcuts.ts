import { Os } from './platform';

/**
 * Shortcuts the system or the platform keeps (design 085 E6). Pure.
 *
 * - `blocked`: the system or the native menu takes them before the app sees them, or they move
 *   the focus (Tab) – they cannot be recorded.
 * - `warn`: a standard meaning people expect (other apps, the system) – allowed, with a hint.
 *
 * Sources: Apple Human Interface Guidelines, „Keyboards – Standard keyboard shortcuts“
 * (https://developer.apple.com/design/human-interface-guidelines/keyboards) and Microsoft Support,
 * „Keyboard shortcuts in Windows“
 * (https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows);
 * `app` = fixed by AppIconic itself (`app_menu.rs`, design 005 E7). Chords in the canonical
 * notation of `shortcut.ts` (`Mod` = ⌘ on macOS, Ctrl elsewhere).
 */
export type ReservedLevel = 'blocked' | 'warn';
export type ReservedReason = 'system' | 'appMenu' | 'focus' | 'standard' | 'control';
export type ReservedSource = 'apple' | 'microsoft' | 'app';

export interface Reservation {
  level: ReservedLevel;
  reason: ReservedReason;
  source: ReservedSource;
  /** The actions whose standard shortcut it is (no warning for them). */
  owners?: readonly string[];
}

type Table = Record<string, Reservation>;

const sys = (source: ReservedSource): Reservation => ({
  level: 'blocked',
  reason: 'system',
  source,
});
const own = (level: ReservedLevel, reason: ReservedReason, ...owners: string[]): Reservation => ({
  level,
  reason,
  source: reason === 'appMenu' ? 'app' : 'apple',
  owners,
});
const std = (source: ReservedSource, ...owners: string[]): Reservation => ({
  level: 'warn',
  reason: 'standard',
  source,
  owners,
});
const focus = (source: ReservedSource): Reservation => ({
  level: 'blocked',
  reason: 'focus',
  source,
});

const MAC: Table = {
  // the system: app switcher, Spotlight, input sources, Force Quit, lock screen, log out
  'Mod+Tab': sys('apple'),
  'Mod+Shift+Tab': sys('apple'),
  'Mod+Space': sys('apple'),
  'Mod+Alt+Space': sys('apple'),
  'Mod+Ctrl+Space': sys('apple'),
  // input sources – only with several of them; the tree's ⌃Space (design 006) stays
  'Ctrl+Space': std('apple', 'hierarchy.toggleSelect'),
  'Ctrl+Alt+Space': sys('apple'),
  'Mod+Alt+Escape': sys('apple'),
  'Mod+Ctrl+q': sys('apple'),
  'Mod+Shift+q': sys('apple'),
  'Mod+Alt+Shift+q': sys('apple'),
  // the app menu and the Window menu (predefined items, `app_menu.rs`)
  'Mod+q': own('blocked', 'appMenu', 'app.quit'),
  'Mod+h': own('blocked', 'appMenu'),
  'Mod+Alt+h': own('blocked', 'appMenu'),
  'Mod+m': own('blocked', 'appMenu'),
  // predefined Cut/Copy/Paste/Select All of the Edit menu (design 005 E7)
  'Mod+x': own('blocked', 'appMenu', 'edit.cut'),
  'Mod+c': own('blocked', 'appMenu', 'edit.copy'),
  'Mod+v': own('blocked', 'appMenu', 'edit.paste'),
  'Mod+a': own('blocked', 'appMenu', 'edit.selectAll'),
  Tab: focus('apple'),
  'Shift+Tab': focus('apple'),
  // standard meanings (HIG table)
  'Mod+`': std('apple'),
  'Mod+F5': std('apple'),
  'Mod+Alt+d': std('apple'),
  'Mod+Ctrl+f': std('apple'),
  'Mod+w': std('apple', 'file.close'),
  'Mod+,': std('apple', 'app.settings'),
  'Mod+z': std('apple', 'edit.undo'),
  'Mod+Shift+z': std('apple', 'edit.redo'),
  'Mod+s': std('apple', 'file.save'),
  'Mod+Shift+s': std('apple', 'file.saveAs'),
  'Mod+o': std('apple', 'file.open'),
  'Mod+n': std('apple', 'file.new'),
};
// Full Keyboard Access: ⌃F1 … ⌃F7, ⌃⇧F4, ⌃⇧F6
for (let i = 1; i <= 7; i++) MAC[`Ctrl+F${i}`] = std('apple');
MAC['Ctrl+Shift+F4'] = std('apple');
MAC['Ctrl+Shift+F6'] = std('apple');

const OTHER: Table = {
  'Alt+F4': sys('microsoft'),
  'Alt+Tab': sys('microsoft'),
  'Alt+Shift+Tab': sys('microsoft'),
  'Alt+Escape': sys('microsoft'),
  'Alt+Space': sys('microsoft'),
  'Mod+Escape': sys('microsoft'),
  'Mod+Shift+Escape': sys('microsoft'),
  'Mod+Alt+Delete': sys('microsoft'),
  Tab: focus('microsoft'),
  'Shift+Tab': focus('microsoft'),
  F10: std('microsoft', 'app.focusMenu'),
  'Mod+w': std('microsoft', 'file.close'),
  'Mod+z': std('microsoft', 'edit.undo'),
  'Mod+y': std('microsoft', 'edit.redo'),
  'Mod+s': std('microsoft', 'file.save'),
  'Mod+o': std('microsoft', 'file.open'),
  'Mod+n': std('microsoft', 'file.new'),
  'Mod+x': std('microsoft', 'edit.cut'),
  'Mod+c': std('microsoft', 'edit.copy'),
  'Mod+v': std('microsoft', 'edit.paste'),
  'Mod+a': std('microsoft', 'edit.selectAll'),
};

/**
 * Actions whose shortcut cannot be changed on macOS: Quit is fixed in the app menu, Cut/Copy/
 * Paste/Select All are predefined Cocoa items (design 005 E7) – the keymap would not reach them.
 */
export const FIXED_ACTIONS_MAC: ReadonlySet<string> = new Set([
  'app.quit',
  'edit.cut',
  'edit.copy',
  'edit.paste',
  'edit.selectAll',
]);

function modifiers(chord: string): string[] {
  const parts = chord.endsWith('++') ? chord.slice(0, -2).split('+') : chord.split('+');
  return chord.endsWith('++') ? parts.filter(Boolean) : parts.slice(0, -1);
}

/**
 * What the platform says about `chord` for `action` (`null` = nothing): a chord that is the
 * action's own standard one never counts.
 */
export function reservation(os: Os, chord: string, action?: string): Reservation | null {
  const r = (os === 'mac' ? MAC : OTHER)[chord];
  if (r) return action && r.owners?.includes(action) ? null : r;
  const mods = modifiers(chord);
  // the Windows / Super key belongs to the system (Microsoft list; GNOME/KDE alike)
  if (os === 'other' && mods.includes('Meta')) return sys('microsoft');
  // HIG: „Avoid using the Control key as a modifier“
  if (os === 'mac' && mods.includes('Ctrl')) {
    return { level: 'warn', reason: 'control', source: 'apple' };
  }
  return null;
}
