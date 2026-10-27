import { DestroyRef } from '@angular/core';
import { NUDGES } from '../../core/actions/action-catalog';
import { ActionHandler, ActionService } from '../../core/actions/action.service';
import { CANVAS_BOUNDS, clampTranslation } from '../../shared/geometry/bounds-guard';
import { Point } from '../../shared/geometry/view-transform';
import { SetAttributes } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { NodeRef } from '../document/icon-document';
import { CanvasEditStore } from './canvas-edit.store';
import { moveChanges } from './edit-ops';
import { deletePoint } from './handles/handle-edit';
import { readGeometry } from './handles/node-geometry';
import { nodeSnaps, unionBounds } from './selection-measure';

/**
 * Editing actions of the canvas (design 007 E12, E15): Escape (the freehand stroke/tool of
 * design 013 E3, cancel the drag, drop the chosen point, leave the group context – else the key falls through to Deselect), Delete Point (else
 * Delete), the arrow keys (1 / ⇧ 10 document units, one undo step per series) and `moveBy` for the
 * AI. Registered by `CanvasView` with its `DestroyRef`.
 */

const keyOf = (refs: readonly NodeRef[]) => refs.map((r) => `${r.asset}#${r.id}`).join('|');

/** The command that moves the selection by `d` (document units), kept on the canvas. */
export function moveSelectionCommand(
  store: DocumentStore,
  host: SVGSVGElement | null,
  d: Point,
  scope: Element | null = null,
): SetAttributes | null {
  const refs = store.selection();
  const doc = store.document();
  const snaps = nodeSnaps(doc, host, refs, scope);
  const union = unionBounds(doc, host, refs, scope);
  if (!snaps.length || !union) return null;
  const changes = moveChanges(snaps, clampTranslation(CANVAS_BOUNDS, union, d));
  return changes.length ? new SetAttributes(changes, 'moveNode') : null;
}

export function registerCanvasEditActions(
  actions: ActionService,
  store: () => DocumentStore | null,
  edit: CanvasEditStore,
  host: () => SVGSVGElement | null,
  destroyRef: DestroyRef,
  tool?: { escape(): boolean; active(): boolean },
  clip?: { scope(): Element | null; exit(): boolean },
): void {
  const hasNodes = () => (store()?.selection().length ?? 0) > 0;
  const scope = () => clip?.scope() ?? null;
  const nudge = (dx: number, dy: number) => {
    const s = store();
    const cmd = s ? moveSelectionCommand(s, host(), { x: dx, y: dy }, scope()) : null;
    if (s && cmd) s.executeCoalescing(cmd, keyOf(s.selection()));
  };
  /** The chosen point, if its node still exists. */
  const point = () => {
    const p = edit.activePoint();
    const el = p ? store()?.document().node(p.ref) : null;
    return p && el ? { ...p, el } : null;
  };
  const handlers: Record<string, ActionHandler> = {
    'canvas.escape': {
      run: () => {
        // the freehand tool first (design 013 E3): its stroke, then the tool
        if (tool?.escape()) return;
        if (edit.escape()) return;
        // the clip path edit mode (design 014 E7) before the group context
        if (clip?.exit()) return;
        const ctx = edit.context();
        if (!ctx) return;
        edit.context.set(null);
        store()?.select([ctx]);
      },
      enabled: () => !!tool?.active() || edit.canEscape() || scope() !== null,
    },
    'canvas.deletePoint': {
      run: () => {
        const p = point();
        const s = store();
        const attrs = p ? deletePoint(readGeometry(p.el), p.role) : null;
        edit.activePoint.set(null);
        if (!s || !p || !attrs) return;
        s.execute(
          new SetAttributes(
            Object.entries(attrs).map(([name, value]) => ({ ref: p.ref, name, value })),
            'deletePoint',
          ),
        );
      },
      enabled: () => point() !== null,
    },
    'arrange.moveBy': {
      run: (args) => {
        const { dx, dy } = args as { dx: number; dy: number };
        const s = store();
        const cmd = s ? moveSelectionCommand(s, host(), { x: dx, y: dy }, scope()) : null;
        if (s && cmd) s.execute(cmd);
      },
      enabled: hasNodes,
    },
  };
  for (const [id, , dx, dy] of NUDGES)
    handlers[id] = { run: () => nudge(dx, dy), enabled: hasNodes };
  actions.registerAll(handlers, destroyRef);
}
