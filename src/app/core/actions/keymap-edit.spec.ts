import { ACTIONS } from './action-catalog';
import { buildKeymap } from './keymap';
import {
  assign,
  changesFor,
  ChordMap,
  chordMap,
  conflicts,
  defaults,
  deviations,
  editable,
  overlaps,
  removeChord,
  resetAction,
  setChords,
} from './keymap-edit';
import { Os } from './platform';

const sameSet = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && a.every((c) => b.includes(c));

/** `keymap.json` of `map` loaded again gives the same shortcuts (design 085 E1). */
function roundTrips(map: ChordMap, os: Os): void {
  const rebuilt = chordMap(buildKeymap(os, deviations(map, os)));
  for (const def of ACTIONS) {
    expect(sameSet(rebuilt.get(def.id), map.get(def.id)), def.id).toBe(true);
  }
}

describe('keymap-edit (design 085)', () => {
  it('contexts that meet', () => {
    expect(overlaps('global', 'canvas')).toBe(true);
    expect(overlaps('drawing', 'canvas')).toBe(true);
    expect(overlaps('hierarchy', 'canvas')).toBe(false);
    expect(overlaps('dialog', 'global')).toBe(false);
  });

  it('the built-in keymaps have no deviation and an empty patch', () => {
    for (const os of ['mac', 'other'] as const) {
      expect(deviations(defaults(os), os)).toEqual({});
      const changes = changesFor(defaults(os), os);
      expect(Object.keys(changes)).toHaveLength(ACTIONS.length);
      expect(Object.values(changes).every((v) => v === null)).toBe(true);
    }
  });

  it('finds conflicts in contexts that meet, not built-in overlaps', () => {
    const d = defaults('other');
    // Shift+r = Rotate Tool (global)
    expect(conflicts(d, 'other', 'tool.select', 'Shift+r')).toEqual(['transform.rotate']);
    // a canvas action meets the global one
    expect(conflicts(d, 'other', 'canvas.escape', 'Shift+r')).toEqual(['transform.rotate']);
    // the tree does not meet the canvas: ArrowLeft is hierarchy.collapse and a canvas nudge
    expect(conflicts(d, 'other', 'hierarchy.collapse', 'ArrowLeft')).toEqual([]);
    // Esc: global Deselect and the canvas's own Escape are built in together
    expect(conflicts(d, 'other', 'canvas.escape', 'Escape')).toEqual([]);
  });

  it('assigns a free chord at once and replaces the one clicked', () => {
    const r = assign(defaults('other'), 'other', {
      id: 'transform.rotate',
      chord: 'q',
      old: 'Shift+r',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.map.get('transform.rotate')).toEqual(['q']);
    expect(deviations(r.map, 'other')).toEqual({ 'transform.rotate': ['q'] });
    roundTrips(r.map, 'other');
    // + adds one more
    const more = assign(r.map, 'other', { id: 'transform.rotate', chord: 'Shift+F12' });
    expect(more.ok && more.map.get('transform.rotate')).toEqual(['q', 'Shift+F12']);
  });

  it('reports a conflict, replaces or swaps on request', () => {
    const d = defaults('other');
    const a = { id: 'transform.rotate', chord: 'Shift+s', old: 'Shift+r' };
    const c = assign(d, 'other', a);
    expect(c).toEqual({ ok: false, reason: 'conflict', conflicts: ['transform.scale'] });

    const replaced = assign(d, 'other', { ...a, resolution: 'replace' });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.map.get('transform.rotate')).toEqual(['Shift+s']);
    expect(replaced.map.get('transform.scale')).toEqual([]);
    expect(deviations(replaced.map, 'other')).toEqual({
      'transform.rotate': ['Shift+s'],
      'transform.scale': [],
    });
    roundTrips(replaced.map, 'other');

    const swapped = assign(d, 'other', { ...a, resolution: 'swap' });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.map.get('transform.rotate')).toEqual(['Shift+s']);
    expect(swapped.map.get('transform.scale')).toEqual(['Shift+r']);
    roundTrips(swapped.map, 'other');
  });

  it('cannot swap without an old chord or into a clash', () => {
    const d = defaults('other');
    // an added chord has nothing to give back
    expect(
      assign(d, 'other', { id: 'transform.rotate', chord: 'Shift+s', resolution: 'swap' }),
    ).toMatchObject({ ok: false, reason: 'swap' });
    // Circle (global `c`) takes Rotate's Shift+r and would give Rotate its `c` – which the canvas
    // action freehand.toggleClosed holds (built in only for Circle, not for Rotate)
    const m = assign(d, 'other', {
      id: 'sketch.circleCenter',
      chord: 'Shift+r',
      old: 'c',
      resolution: 'swap',
    });
    expect(m).toMatchObject({ ok: false, reason: 'swap' });
  });

  it('refuses blocked chords and fixed actions, notes standard ones', () => {
    expect(
      assign(defaults('other'), 'other', { id: 'tool.select', chord: 'Alt+F4' }),
    ).toMatchObject({ ok: false, reason: 'blocked', reservation: { source: 'microsoft' } });
    expect(assign(defaults('mac'), 'mac', { id: 'tool.select', chord: 'Mod+h' })).toMatchObject({
      ok: false,
      reason: 'blocked',
    });
    expect(editable('mac', 'app.quit')).toBe(false);
    expect(editable('other', 'app.quit')).toBe(true);
    expect(editable('other', 'settings.set')).toBe(false);
    expect(assign(defaults('mac'), 'mac', { id: 'edit.copy', chord: 'Mod+k' })).toMatchObject({
      ok: false,
      reason: 'fixed',
    });
    const w = assign(defaults('mac'), 'mac', { id: 'tool.select', chord: 'Mod+`' });
    expect(w.ok && w.warning?.reason).toBe('standard');
  });

  it('removes, resets one and keeps built-in overlaps when resetting', () => {
    const d = defaults('other');
    const removed = removeChord(d, 'edit.delete', 'Backspace');
    expect(removed.get('edit.delete')).toEqual(['Delete']);
    expect(deviations(removed, 'other')).toEqual({ 'edit.delete': ['Delete'] });
    roundTrips(removed, 'other');

    // tool.select takes Rotate's Shift+r; resetting Rotate takes it back
    const took = assign(d, 'other', {
      id: 'tool.select',
      chord: 'Shift+r',
      resolution: 'replace',
    });
    expect(took.ok).toBe(true);
    if (!took.ok) return;
    const back = resetAction(took.map, 'other', 'transform.rotate');
    expect(back.get('transform.rotate')).toEqual(['Shift+r']);
    expect(back.get('tool.select')).toEqual(['v']);
    roundTrips(back, 'other');

    // resetting the canvas Escape does not take Esc from the global Deselect
    const esc = resetAction(d, 'other', 'canvas.escape');
    expect(esc.get('edit.deselect')).toContain('Escape');
    expect(deviations(esc, 'other')).toEqual({});
  });

  it('sets exact chords (keymap.set) and refuses blocked ones', () => {
    const d = defaults('mac');
    const m = setChords(d, 'mac', 'transform.rotate', ['q', 'Mod+Shift+e']);
    expect(m?.get('transform.rotate')).toEqual(['q', 'Mod+Shift+e']);
    roundTrips(m!, 'mac');
    expect(setChords(d, 'mac', 'transform.rotate', ['Mod+q'])).toBeNull();
    expect(setChords(d, 'mac', 'app.quit', ['q'])).toBeNull();
  });

  it('the patch names every action: deviations with chords, the rest null', () => {
    const r = assign(defaults('other'), 'other', {
      id: 'transform.rotate',
      chord: 'q',
      old: 'Shift+r',
    });
    if (!r.ok) throw new Error('expected ok');
    const changes = changesFor(r.map, 'other');
    expect(changes['transform.rotate']).toEqual(['q']);
    expect(changes['edit.undo']).toBeNull();
  });
});
