import { actionDef } from '../../core/actions/action-catalog';
import { buildKeymap } from '../../core/actions/keymap';
import { ADD_MENU_LAYOUT, addLayoutIds, MODIFY_IDS, TOOL_ACTION_IDS } from '../commands/add-layout';
import { matches } from './command-palette';
import {
  actionIds,
  buildMenuModel,
  isRadio,
  menuChord,
  menuLabel,
  resolveMenu,
  toSpec,
} from './menu-model';

const look = {
  label: (id: string) => `L:${id}`,
  enabled: () => true,
  checked: (id: string) => (id === 'view.rulers' ? true : undefined),
  chord: (id: string) => (id === 'file.save' ? 'Mod+s' : ''),
  anyChord: (id: string) => (id === 'file.save' ? 'Mod+s' : id === 'edit.delete' ? 'Delete' : ''),
};

const all = (os: 'mac' | 'other') =>
  buildMenuModel(os, { recent: [] }).flatMap((m) => actionIds(m.items));

describe('menu model (design 005 E5)', () => {
  it('has the menus of the prompt and only catalogue actions with texts', () => {
    expect(buildMenuModel('other', { recent: [] }).map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'View',
      'Add',
      'Modify',
      'Arrange',
      'Help',
    ]);
    for (const os of ['mac', 'other'] as const) {
      for (const id of all(os)) {
        expect(actionDef(id), id).toBeDefined();
        expect(actionDef(id)!.label.trim(), id).not.toBe('');
      }
    }
    for (const id of ['file.exportPng', 'add.image', 'arrange.align.left', 'view.magicSnap']) {
      expect(all('mac')).toContain(id);
    }
  });

  it('builds the Add menu from the sidebar layout: shapes in submenus like Fusion', () => {
    const add = buildMenuModel('other', { recent: [] }).find((m) => m.label === 'Add')!;
    expect(actionIds(add.items)).toEqual(addLayoutIds(ADD_MENU_LAYOUT));
    const subs = add.items.filter((i) => i.kind === 'submenu').map((i) => i.label);
    expect(subs).toEqual([
      'Shapes',
      'Pen',
      'Edit Path',
      'Cut',
      'Transform',
      'Measure & Dimension',
      'Line',
      'Rectangle',
      'Circle',
      'Arc',
      'Polygon',
      'Shape at Centre',
    ]);
    const circle = add.items.find((i) => i.kind === 'submenu' && i.label === 'Circle')!;
    expect(actionIds([circle]).slice(0, 2)).toEqual(['sketch.circleCenter', 'sketch.circle2p']);
    // tools · construction · insert
    expect(add.items.filter((i) => i.kind === 'separator')).toHaveLength(2);
  });

  it('the Modify menu has the commands that change the selection (prompt 068)', () => {
    const modify = buildMenuModel('other', { recent: [] }).find((m) => m.label === 'Modify')!;
    const ids = actionIds(modify.items);
    expect(ids.slice(0, MODIFY_IDS.length)).toEqual([...MODIFY_IDS]);
    expect(ids).toContain('pathfinder.unite');
    // no tool in it, no command twice in the menus
    for (const id of ids) expect(TOOL_ACTION_IDS).not.toContain(id);
    const everything = all('other');
    expect(new Set(everything).size).toBe(everything.length);
  });

  it('puts About and Quit into the app menu on macOS', () => {
    for (const id of ['app.about', 'app.quit']) {
      expect(all('mac')).not.toContain(id);
      expect(all('other')).toContain(id);
    }
  });

  it('lists recent files by name, else "No Recent Items"', () => {
    const [file] = buildMenuModel('other', { recent: ['a.icon', 'b.icon'] });
    const recent = file.items.find((i) => i.kind === 'submenu')!;
    expect(recent.kind === 'submenu' && recent.items[1]).toEqual({
      kind: 'action',
      id: 'file.recent.2',
      label: 'b.icon',
    });
    expect(actionIds(buildMenuModel('other', { recent: [] })[0].items)).toContain('file.noRecent');
  });

  it('resolves labels, checks and shortcuts and strips them for Rust', () => {
    const menus = resolveMenu(buildMenuModel('other', { recent: [] }), look, 'other');
    const save = menus[0].items.find((i) => i.kind === 'action' && i.id === 'file.save');
    expect(save).toMatchObject({ label: 'L:file.save', accelerator: 'Mod+s', shortcut: 'Ctrl+S' });
    const del = menus[1].items.find((i) => i.kind === 'action' && i.id === 'edit.delete');
    expect(del).toMatchObject({ shortcut: 'Delete' });
    expect(del).not.toHaveProperty('accelerator');
    const spec = JSON.stringify(toSpec(menus));
    expect(spec).not.toContain('"shortcut":');
    expect(spec).toContain('"checked":true');
  });

  it('the native menu only gets chords with a modifier or an F key', () => {
    expect(menuChord(['Delete', 'Backspace'])).toBe('');
    expect(menuChord(['Escape', 'Mod+Shift+a'])).toBe('Mod+Shift+a');
    expect(menuChord(['F10'])).toBe('F10');
    for (const os of ['mac', 'other'] as const) {
      const k = buildKeymap(os);
      for (const id of all(os)) {
        const c = menuChord(k.chords.get(id) ?? []);
        if (c) expect(c, id).toMatch(/^(Mod|Ctrl|Alt|Shift|F\d)/);
      }
      // zoom in shows ⌘= (⌘+ is no accelerator)
      expect(menuChord(k.chords.get('view.zoomIn')!)).toBe('Mod+=');
    }
  });

  it('cleans labels and knows radio items', () => {
    expect(menuLabel('a\nb')).toBe('a b');
    expect(menuLabel('')).toBe('…');
    expect([...menuLabel('x'.repeat(200))]).toHaveLength(120);
    expect(isRadio('view.mask.circle')).toBe(true);
    expect(isRadio('view.rulers')).toBe(false);
  });

  it('the palette matches every word in label or id', () => {
    expect(matches({ id: 'view.crossCursor', label: 'Cross Cursor' }, 'cross cur')).toBe(true);
    expect(matches({ id: 'view.crossCursor', label: 'Cross Cursor' }, 'view.cross')).toBe(true);
    expect(matches({ id: 'view.crossCursor', label: 'Cross Cursor' }, 'cross zoom')).toBe(false);
    expect(matches({ id: 'file.save', label: 'Save' }, '')).toBe(true);
  });
});
