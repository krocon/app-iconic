import { actionDef } from '../../core/actions/action-catalog';
import { contextActionIds, contextMenuFor, ContextTarget } from './context-menu-model';

describe('context menu model (prompt 070)', () => {
  const targets: ContextTarget[] = ['nodes', 'items', 'empty', 'tool'];

  it('has only catalogue actions, every one once', () => {
    for (const t of targets) {
      const ids = contextActionIds(contextMenuFor(t));
      for (const id of ids) expect(actionDef(id), `${t}: ${id}`).toBeDefined();
      expect(new Set(ids).size, t).toBe(ids.length);
    }
  });

  it('nodes: edit, group, Arrange ▸, lock, Pathfinder ▸, clip and source', () => {
    const m = contextMenuFor('nodes');
    expect(m.filter((e) => e.items).map((e) => e.label)).toEqual(['Arrange', 'Pathfinder']);
    const ids = contextActionIds(m);
    for (const id of [
      'edit.cut',
      'arrange.group',
      'arrange.bringToFront',
      'edit.toggleLock',
      'pathfinder.unite',
      'path.offset',
      'clip.create',
      'edit.editSvg',
    ]) {
      expect(ids).toContain(id);
    }
    expect(m.find((e) => e.id === 'edit.delete')!.args).toEqual({ confirm: true });
  });

  it('the empty canvas, groups / layers and a tool have their own', () => {
    expect(contextActionIds(contextMenuFor('empty'))).toContain('edit.selectAll');
    expect(contextActionIds(contextMenuFor('items'))).toContain('arrange.moveInto');
    expect(contextMenuFor('tool')[0].id).toBe('tool.done');
  });
});
