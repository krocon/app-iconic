import { effect, Signal, untracked } from '@angular/core';
import { ClipEditStore } from '../clip/clip-edit.store';
import { DocumentStore } from '../document/document.store';
import { CanvasEditStore } from './canvas-edit.store';

/**
 * Editing states that follow a selection made elsewhere (tree, AI; designs 007 E3, 014 E7): the
 * clip edit mode ends when its clip is gone or something outside it is selected; the chosen point
 * goes with its node; the group context is left when the selection leaves it. Call in an
 * injection context (it creates effects).
 */
export function followSelection(
  store: Signal<DocumentStore | null> | (() => DocumentStore | null),
  edit: CanvasEditStore,
  clipEdit: ClipEditStore,
): void {
  // the edit mode ends when its clip is gone (undo, delete), the document changes or something
  // outside the clip is selected (tree, AI)
  effect(() => {
    const s = store();
    const doc = s?.document();
    const refs = s?.selection() ?? [];
    if (!untracked(() => clipEdit.target())) return;
    const scope = clipEdit.scope(doc);
    if (!scope || refs.some((r) => !scope.contains(doc!.node(r)))) clipEdit.exit();
  });
  // a selection made elsewhere (tree, AI) outside the group context leaves it; the chosen
  // point goes with its node
  effect(() => {
    const s = store();
    const refs = s?.selection() ?? [];
    const p = untracked(() => edit.activePoint());
    if (p && !refs.some((r) => r.asset === p.ref.asset && r.id === p.ref.id)) {
      edit.activePoint.set(null);
    }
    const ctx = edit.context();
    if (!ctx) return;
    const el = s?.document().node(ctx);
    const inside =
      !!el && refs.every((r) => r.asset === ctx.asset && el.contains(s!.document().node(r)));
    if (!inside) edit.context.set(null);
  });
}
