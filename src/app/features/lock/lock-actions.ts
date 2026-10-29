import { DestroyRef } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { isEnterable } from '../canvas/hit-test';
import { LayerStyleService } from '../canvas/layer-style.service';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { LOCK_ATTR, lockCommand, unlockAllCommand } from './lock';
import { GuideService } from '../guides/guide.service';
import { ConstructionMode } from '../construction/construction-mode';

/**
 * The actions of prompt 055: `edit.toggleLock { nodes? }` (⌘L; locked nodes leave the selection),
 * `edit.unlockAll` (⌘⌥L), `edit.isolate` (the selected group becomes the canvas's context – the
 * rest fades; again or Esc leaves), `view.constructionLines` (show / hide construction lines).
 */
export function registerLockActions(
  actions: ActionService,
  files: FilesService,
  edit: CanvasEditStore,
  style: LayerStyleService,
  guides: GuideService,
  mode: ConstructionMode,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'edit.toggleLock': {
        run: (a) => {
          const store = files.store();
          const given = (a as { nodes?: NodeRef[] } | undefined)?.nodes;
          const refs = Array.isArray(given) ? given : (store?.selection() ?? []);
          const cmd = store ? lockCommand(store.document(), refs) : null;
          if (!store || !cmd) return false;
          store.execute(cmd);
          const doc = store.document();
          store.selection.set(
            store.selection().filter((r) => !doc.node(r)?.hasAttribute(LOCK_ATTR)),
          );
          return true;
        },
        enabled: () => (files.store()?.selection().length ?? 0) > 0,
      },
      'edit.unlockAll': {
        run: () => {
          const store = files.store();
          const cmd = store ? unlockAllCommand(store.document()) : null;
          if (!store || !cmd) return false;
          store.execute(cmd);
          return true;
        },
        enabled: () => !!files.store(),
      },
      'edit.isolate': {
        run: () => {
          const store = files.store();
          if (!store) return false;
          if (edit.context()) {
            edit.context.set(null);
            return true;
          }
          const sel = store.selection();
          const el = sel.length === 1 ? store.document().node(sel[0]) : null;
          if (!isEnterable(el)) return false;
          edit.context.set(sel[0]);
          store.selection.set([]);
          return true;
        },
        enabled: () => !!edit.context() || (files.store()?.selection().length ?? 0) === 1,
        checked: () => !!edit.context(),
      },
      'guide.add': {
        run: (a) => {
          const g = (a ?? {}) as { axis?: unknown; at?: unknown };
          return typeof g.at === 'number'
            ? guides.addGuide(g.axis === 'vertical' ? 'vertical' : 'horizontal', g.at)
            : false;
        },
      },
      'sketch.toggleConstructionMode': {
        run: () => mode.on.update((v) => !v),
        checked: () => mode.on(),
      },
      'view.constructionLines': {
        run: () => style.construction.update((v) => !v),
        checked: () => style.construction(),
      },
    },
    destroyRef,
  );
}
