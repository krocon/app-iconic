import { buildKeymap } from './keymap';
import { reservation } from './reserved-shortcuts';
import { chordOf } from './shortcut';

const key = (
  k: string,
  mods: Partial<Record<'meta' | 'ctrl' | 'alt' | 'shift', boolean>> = {},
) => ({
  key: k,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
});

describe('reserved shortcuts (design 085 E6)', () => {
  it('macOS: the system and the app menu keep theirs', () => {
    for (const c of ['Mod+Tab', 'Mod+Space', 'Mod+Alt+Escape', 'Mod+h', 'Mod+m', 'Mod+q', 'Tab']) {
      expect(reservation('mac', c)?.level, c).toBe('blocked');
    }
    // ⌘Q is Quit's own
    expect(reservation('mac', 'Mod+q', 'app.quit')).toBeNull();
    expect(reservation('mac', 'Mod+w')).toMatchObject({ level: 'warn', source: 'apple' });
    expect(reservation('mac', 'Mod+w', 'file.close')).toBeNull();
    expect(reservation('mac', 'Ctrl+F2')?.level).toBe('warn');
    expect(reservation('mac', 'Mod+Ctrl+k')).toMatchObject({ level: 'warn', reason: 'control' });
    expect(reservation('mac', 'q')).toBeNull();
  });

  it('Windows/Linux: Alt+F4, Alt+Tab, the Windows key …', () => {
    for (const c of ['Alt+F4', 'Alt+Tab', 'Mod+Shift+Escape', 'Mod+Alt+Delete', 'Meta+e', 'Tab']) {
      expect(reservation('other', c)?.level, c).toBe('blocked');
    }
    expect(reservation('other', 'F10')).toMatchObject({ level: 'warn', source: 'microsoft' });
    expect(reservation('other', 'F10', 'app.focusMenu')).toBeNull();
    expect(reservation('other', 'Mod+Ctrl+k')).toBeNull();
  });

  it('the table uses the chords key events give', () => {
    expect(chordOf(key('F4', { alt: true }), 'other')).toBe('Alt+F4');
    expect(chordOf(key('Tab', { meta: true }), 'mac')).toBe('Mod+Tab');
    expect(chordOf(key('`', { meta: true }), 'mac')).toBe('Mod+`');
    expect(chordOf(key('Escape', { meta: true, alt: true }), 'mac')).toBe('Mod+Alt+Escape');
  });

  it('no built-in shortcut is blocked for its own action', () => {
    for (const os of ['mac', 'other'] as const) {
      for (const [id, chords] of buildKeymap(os).chords) {
        for (const c of chords) {
          expect(reservation(os, c, id)?.level, `${os} ${id} ${c}`).not.toBe('blocked');
        }
      }
    }
  });
});
