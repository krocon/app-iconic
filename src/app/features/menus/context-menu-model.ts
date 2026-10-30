import { MENUS_TEXTS } from './menus-texts';

/** One entry of a context menu: an action (optional arguments, own label) or a submenu. */
export interface ContextEntry {
  /** The action id; a submenu: `submenu:<name>`. */
  id: string;
  args?: unknown;
  label?: string;
  separatorBefore?: boolean;
  /** A submenu (one level, prompt 070). */
  items?: readonly ContextEntry[];
}

/** What was right-clicked (prompt 070). */
export type ContextTarget =
  /** SVG nodes of the selection. */
  | 'nodes'
  /** Groups / layers / the icon (the tree's upper rows). */
  | 'items'
  /** The empty canvas. */
  | 'empty'
  /** A tool is on. */
  | 'tool';

const a = (id: string, extra: Partial<ContextEntry> = {}): ContextEntry => ({ id, ...extra });
const sep = (e: ContextEntry): ContextEntry => ({ ...e, separatorBefore: true });

/**
 * The context menu for a target (prompt 070), one model for the canvas and the tree – built from
 * action ids like the main menu (design 005), so a disabled entry is greyed out by the action's own
 * `enabled`, not hidden. Pure.
 */
export function contextMenuFor(target: ContextTarget): ContextEntry[] {
  const t = MENUS_TEXTS;
  const del = a('edit.delete', { args: { confirm: true }, label: t.deleteMenu });
  switch (target) {
    case 'tool':
      return [a('tool.done'), sep(a('tool.select')), a('tool.direct')];
    case 'empty':
      return [
        a('edit.paste'),
        a('edit.selectAll'),
        sep(a('view.zoomToFit')),
        a('view.actualSize'),
        sep(a('guides.lock')),
        a('view.constructionLines'),
      ];
    case 'items':
      return [
        a('edit.duplicate'),
        del,
        sep(a('edit.toggleVisibility')),
        sep(a('arrange.moveUp')),
        a('arrange.moveDown'),
        a('arrange.moveInto'),
        sep(a('add.iconGroup')),
        a('add.layer'),
        sep(a('hierarchy.expandAll')),
        a('hierarchy.collapseAll'),
      ];
    case 'nodes':
      return [
        a('edit.cut'),
        a('edit.copy'),
        a('edit.paste'),
        a('edit.duplicate'),
        del,
        sep(a('arrange.group')),
        a('arrange.ungroup'),
        {
          id: 'submenu:arrange',
          label: t.arrange,
          items: [
            a('arrange.bringToFront'),
            a('arrange.sendToBack'),
            a('arrange.moveUp'),
            a('arrange.moveDown'),
          ],
        },
        sep(a('edit.toggleLock')),
        a('edit.isolate'),
        a('edit.toggleVisibility'),
        sep(a('path.convert')),
        a('text.toPath'),
        a('mask.create'),
        a('mask.release'),
        {
          id: 'submenu:pathfinder',
          label: t.pathfinder,
          items: [
            a('pathfinder.unite'),
            a('pathfinder.minusFront'),
            a('pathfinder.intersect'),
            a('pathfinder.exclude'),
            a('pathfinder.divide'),
          ],
        },
        a('path.offset'),
        a('corners.set'),
        sep(a('clip.create')),
        a('edit.editSvg'),
        a('edit.copyXml'),
      ];
  }
}

/** Every action id of a menu (submenus included). */
export function contextActionIds(entries: readonly ContextEntry[]): string[] {
  return entries.flatMap((e) => (e.items ? contextActionIds(e.items) : [e.id]));
}
