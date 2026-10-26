import { ACTIONS } from './action-catalog';
import { buildKeymap, CONTEXTS, keymapFiles } from './keymap';
import { normalizeChord } from './shortcut';

describe('keymap (design 005 E2)', () => {
  it('has only known actions, valid chords and no conflicts on both OS', () => {
    for (const os of ['mac', 'other'] as const) expect(buildKeymap(os).notes).toEqual([]);
  });

  it('no chord twice per context, the OS files only add', () => {
    for (const os of ['mac', 'other'] as const) {
      const [base, own] = keymapFiles(os);
      for (const ctx of CONTEXTS) {
        const b = Object.keys(base[ctx] ?? {}).map((c) => normalizeChord(c, os));
        const o = Object.keys(own[ctx] ?? {}).map((c) => normalizeChord(c, os));
        expect(new Set(b).size, `${os} ${ctx}`).toBe(b.length);
        expect(
          o.filter((c) => b.includes(c)),
          `${os} ${ctx}`,
        ).toEqual([]);
      }
    }
  });

  /**
   * Deliberate exceptions (design 007 E15): these canvas actions are enabled only while there is
   * something to do (a drag to cancel, a chosen point) – otherwise the key falls through to the
   * global action (dispatcher, design 005 E4).
   */
  const FALLS_THROUGH = new Set(['canvas.escape', 'canvas.deletePoint']);

  it('a context shortcut does not hide a global one', () => {
    for (const os of ['mac', 'other'] as const) {
      const k = buildKeymap(os);
      for (const ctx of ['canvas', 'hierarchy', 'dialog'] as const) {
        for (const [chord, id] of k.byContext[ctx]) {
          if (FALLS_THROUGH.has(id)) continue;
          expect(k.byContext.global.has(chord), `${ctx} ${chord}`).toBe(false);
        }
      }
    }
  });

  it('has the legacy shortcuts (legacy §4) with ⌘ on macOS and Ctrl elsewhere', () => {
    const legacy: Record<string, string> = {
      'Mod+Shift+n': 'file.newWindow',
      'Mod+n': 'file.new',
      'Mod+o': 'file.open',
      'Mod+Shift+i': 'file.importSvg',
      'Mod+s': 'file.save',
      'Mod+Shift+s': 'file.saveAs',
      'Mod+w': 'file.close',
      'Mod+z': 'edit.undo',
      'Mod+Shift+z': 'edit.redo',
      'Mod+1': 'view.commandSidebar',
      'Mod+2': 'view.hierarchy',
      'Mod+3': 'view.properties',
      'Mod+i': 'add.image',
      'Mod+=': 'view.zoomIn',
      'Mod+-': 'view.zoomOut',
      'Mod+0': 'view.actualSize',
    };
    for (const os of ['mac', 'other'] as const) {
      const g = buildKeymap(os).byContext.global;
      for (const [chord, id] of Object.entries(legacy)) expect(g.get(chord), chord).toBe(id);
    }
    expect(buildKeymap('other').byContext.global.get('Mod+y')).toBe('edit.redo');
    expect(buildKeymap('mac').byContext.global.get('Mod+y')).toBeUndefined();
    expect(buildKeymap('other').byContext.canvas.get('Space')).toBe('canvas.panHold');
  });

  it('every action id follows the rule Rust checks', () => {
    for (const a of ACTIONS) expect(a.id).toMatch(/^[a-z][A-Za-z0-9.]{0,63}$/);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
  });

  it('applies user overrides in the action’s own context', () => {
    const k = buildKeymap('other', {
      'file.save': ['F2'],
      'nope.x': ['F3'],
      'file.open': ['Hyper+o'],
    });
    expect(k.byContext.global.get('F2')).toBe('file.save');
    expect(k.byContext.global.get('Mod+s')).toBeUndefined();
    expect(k.byContext.global.get('Mod+o')).toBeUndefined();
    expect(k.notes).toEqual([
      'keymap.json: unknown action nope.x',
      'keymap.json: bad shortcut Hyper+o for file.open',
    ]);
  });
});
