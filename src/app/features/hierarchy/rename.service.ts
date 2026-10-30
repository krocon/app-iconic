import { DestroyRef, inject, Injectable } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { CommandError, DocCommand } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { IconItem } from '../document/model/selection';
import { FilesService } from '../files/files.service';
import { renameGroupCommand, renameLayerCommand } from '../inspector/inspector-edit';
import { HIERARCHY_TEXTS as T } from './hierarchy-texts';
import { renameElementCommand } from './rename';

/**
 * Renaming in the tree (prompt 072 E1): groups and layers like the inspector (010 E9, unique layer
 * names), SVG elements by their `id` with every reference (`rename.ts`). One undo step; an invalid
 * name is reported in the status line and changes nothing.
 */
@Injectable({ providedIn: 'root' })
export class RenameService {
  private readonly files = inject(FilesService);

  private run(cmd: DocCommand | null): boolean {
    const s = this.files.store();
    if (!s || !cmd) return false;
    try {
      s.execute(cmd);
      return true;
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      this.files.notice.set(T.renameInvalid);
      return false;
    }
  }

  renameElement(ref: NodeRef, id: string): boolean {
    const s = this.files.store();
    if (!s) return false;
    const r = renameElementCommand(s.document(), ref, id);
    if (typeof r === 'string') {
      this.files.notice.set(
        r === 'taken'
          ? T.renameTaken(id.trim())
          : r === 'referenced'
            ? T.renameReferenced
            : T.renameInvalid,
      );
      return false;
    }
    return this.run(r);
  }

  renameItem(item: IconItem, name: string): boolean {
    const s = this.files.store();
    if (!s) return false;
    const json = s.document().iconJson;
    if (item.kind === 'group') return this.run(renameGroupCommand(json, item.group, name));
    if (item.kind === 'layer')
      return this.run(renameLayerCommand(json, item.group, item.layer, name));
    return false;
  }
}

function isRef(v: unknown): v is NodeRef {
  const r = v as NodeRef | null;
  return !!r && typeof r.asset === 'string' && typeof r.id === 'string';
}

/** `edit.renameElement { ref, id }` – the tree's rename of an element, also for the AI. */
export function registerRenameActions(
  actions: ActionService,
  rename: RenameService,
  files: FilesService,
  destroyRef?: DestroyRef,
): void {
  actions.registerAll(
    {
      'edit.renameElement': {
        run: (a) => {
          const o = (a ?? {}) as { ref?: unknown; id?: unknown };
          return isRef(o.ref) && typeof o.id === 'string'
            ? rename.renameElement(o.ref, o.id)
            : false;
        },
        enabled: () => !!files.store(),
      },
    },
    destroyRef,
  );
}
