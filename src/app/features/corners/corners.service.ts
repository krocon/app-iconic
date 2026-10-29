import { inject, Injectable } from '@angular/core';
import { CORNER_KINDS, CornerKind } from '../../shared/geometry/corners';
import { CompositeCommand, DocCommand, ReplaceNode, SetAttributes } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { cornerChange, cornerSource } from './corner-source';

/**
 * Live Corners as document changes (prompt 045): the command that cuts the corners of one node,
 * and `corners.set { radius, kind }` for the selection (one undo step "Round Corners").
 */
@Injectable({ providedIn: 'root' })
export class CornersService {
  private readonly files = inject(FilesService);

  /** The command cutting the corners of `ref` (`null` when it has none). */
  command(ref: NodeRef, radius: number, kind: CornerKind): DocCommand | null {
    const el = this.files.store()?.document().node(ref);
    const src = el ? cornerSource(el) : null;
    if (!el || !src) return null;
    const change = cornerChange(el, src, radius, kind);
    const inner =
      'markup' in change
        ? new ReplaceNode(ref, change.markup)
        : new SetAttributes(
            Object.entries(change.attrs).map(([name, value]) => ({ ref, name, value })),
            'roundCorners',
          );
    return new CompositeCommand('roundCorners', [inner]);
  }

  /** The ref after `cmd` ran (a replaced node gets a new one). */
  refAfter(cmd: DocCommand, ref: NodeRef): NodeRef {
    const inner = cmd instanceof CompositeCommand ? cmd.commands[0] : cmd;
    return inner instanceof ReplaceNode ? (inner.newRef ?? ref) : ref;
  }

  /** The corners of every selected node with corners, one undo step; `false` when none has. */
  apply(radius: number, kind: CornerKind): boolean {
    const store = this.files.store();
    if (!store || !(radius >= 0) || !CORNER_KINDS.includes(kind)) return false;
    const refs = store.selection();
    const cmds = refs.map((r) => ({ r, c: this.command(r, radius, kind) }));
    const ok = cmds.filter((x): x is { r: NodeRef; c: DocCommand } => x.c !== null);
    if (!ok.length) return false;
    store.execute(
      new CompositeCommand(
        'roundCorners',
        ok.map((x) => x.c),
      ),
    );
    store.selection.set(
      refs.map((r) => {
        const hit = ok.find((x) => x.r === r);
        return hit ? this.refAfter(hit.c, r) : r;
      }),
    );
    return true;
  }

  /** The selection has a node with corners. */
  canApply(): boolean {
    const store = this.files.store();
    return !!store?.selection().some((r) => {
      const el = store.document().node(r);
      return !!el && !!cornerSource(el);
    });
  }
}
