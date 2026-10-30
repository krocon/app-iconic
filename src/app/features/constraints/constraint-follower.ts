import { effect, inject, Injectable, signal } from '@angular/core';
import { CompositeCommand, DocCommand } from '../document/commands';
import { FilesService } from '../files/files.service';
import { constraintHousekeeping } from './constraint-housekeeping';
import { ConstraintService } from './constraint.service';
import { CONSTRAINT_TEXTS as T } from './constraint-texts';

/**
 * Constraints after every change (prompt 065), as followers of the undo service – in the same undo
 * step as the change, before the live fills (060):
 * 1. housekeeping (always): constraints of deleted / replaced elements go, copies get fresh cids
 *    and the constraints among them (`constraintHousekeeping`);
 * 2. with `autoSolve` (setting `constraints.autoSolve`, default off): assets whose constraints no
 *    longer hold are solved again – free moves with the selection keep the relations.
 */
@Injectable({ providedIn: 'root' })
export class ConstraintFollower {
  private readonly files = inject(FilesService);
  private readonly service = inject(ConstraintService);
  /** Solve after free changes (bound to the setting by `SettingsSync`). */
  readonly autoSolve = signal(false);

  constructor() {
    effect(() => {
      const store = this.files.store();
      if (!store) return;
      store.setFollower(() => this.housekeeping(), 'constraintHousekeeping', 5);
      store.setFollower(() => this.solve(), 'constraintSolve', 10);
    });
  }

  housekeeping(): DocCommand | null {
    const store = this.files.store();
    const h = store ? constraintHousekeeping(store.document()) : null;
    if (!h) return null;
    if (h.removed) this.files.notice.set(T.removedOrphans(h.removed));
    return h.command;
  }

  solve(): DocCommand | null {
    if (!this.autoSolve()) return null;
    const cmds: DocCommand[] = [];
    for (const asset of this.service.assets()) {
      if (this.service.holds(asset)) continue;
      const r = this.service.solveCommands(asset);
      if (typeof r !== 'string') cmds.push(...r);
    }
    if (!cmds.length) return null;
    return cmds.length === 1 ? cmds[0] : new CompositeCommand('solveConstraints', cmds);
  }
}
