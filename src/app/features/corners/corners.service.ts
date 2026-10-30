import { editableRefs } from '../lock/lock';
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
    // locked nodes keep their corners (prompt 064)
    const cmds = editableRefs(store.document(), refs).map((r) => ({
      r,
      c: this.command(r, radius, kind),
    }));
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

  // ---- live preview of the popover (prompt 073 E4): an undo gesture, OK = one step ----

  private previewing: { refs: readonly NodeRef[] } | null = null;
  private previewRefs: NodeRef[] | null = null;

  /** Shows `radius` / `kind` on the canvas (replaces the preview before). */
  preview(radius: number, kind: CornerKind): boolean {
    const store = this.files.store();
    if (!store || !(radius >= 0) || !CORNER_KINDS.includes(kind)) return false;
    if (this.previewing) store.cancel();
    else this.previewing = { refs: [...store.selection()] };
    const refs = this.previewing.refs;
    const cmds = editableRefs(store.document(), refs).flatMap((r) => {
      const c = this.command(r, radius, kind);
      return c ? [{ r, c }] : [];
    });
    store.begin('roundCorners');
    if (cmds.length) {
      store.update(
        new CompositeCommand(
          'roundCorners',
          cmds.map((x) => x.c),
        ),
      );
    }
    this.previewRefs = refs.map((r) => {
      const hit = cmds.find((x) => x.r === r);
      return hit ? this.refAfter(hit.c, r) : r;
    });
    return cmds.length > 0;
  }

  /** Keeps the preview as one undo step. */
  commit(): void {
    const store = this.files.store();
    if (!store || !this.previewing) return;
    store.commit();
    if (this.previewRefs) store.selection.set(this.previewRefs);
    this.previewing = null;
    this.previewRefs = null;
  }

  /** Takes the preview back – no undo step. */
  cancel(): void {
    const store = this.files.store();
    const p = this.previewing;
    this.previewing = null;
    this.previewRefs = null;
    if (!store || !p) return;
    store.cancel();
    store.selection.set([...p.refs]);
  }

  /** The selection has a node with corners. */
  canApply(): boolean {
    const store = this.files.store();
    if (!store) return false;
    return editableRefs(store.document(), store.selection()).some((r) => {
      const el = store.document().node(r);
      return !!el && !!cornerSource(el);
    });
  }
}
