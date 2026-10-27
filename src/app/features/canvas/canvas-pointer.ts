import { CANVAS_BOUNDS, clampPoint, clampTranslation } from '../../shared/geometry/bounds-guard';
import {
  combineSelection,
  intersects,
  marqueeRect,
  SelectMode,
  selectModeOf,
} from '../../shared/geometry/box-selection';
import { clientToDocument, nodeBoundsInDocument, Rect } from '../../shared/geometry/dom-geometry';
import { apply, invert } from '../../shared/geometry/matrix';
import { gridOriginPoint, snapMove, snapPoint, SnapOptions } from '../../shared/geometry/snapping';
import { Point } from '../../shared/geometry/view-transform';
import { AttributeChange, SetAttributes } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { NodeRef } from '../document/icon-document';
import { UndoLabel } from '../document/undo/undo-texts';
import { paintedNodes } from '../hierarchy/arrange-operations';
import { isClipGroup } from '../document/model/clip-model';
import { CanvasEditStore } from './canvas-edit.store';
import { DragOp, Modifiers } from './canvas-gesture';
import { CanvasViewStore } from './canvas-view.store';
import {
  boxKeyPoints,
  moveChanges,
  pivotChanges,
  scaleNodeChanges,
  scaleSelectionChanges,
} from './edit-ops';
import { clickHandle, dragHandle, dragLabel } from './handles/handle-edit';
import {
  hitClipShape,
  hitTest,
  isEnterable,
  isRendered,
  paintedRoots,
  selectableRef,
} from './hit-test';
import { magicPoints } from './magic-points';
import { HandleSet, nodeSnaps } from './selection-measure';

/** `r` grown to contain `p`. */
function withPoint(r: Rect, p: Point): Rect {
  const x = Math.min(r.x, p.x);
  const y = Math.min(r.y, p.y);
  return {
    x,
    y,
    width: Math.max(r.x + r.width, p.x) - x,
    height: Math.max(r.y + r.height, p.y) - y,
  };
}

export const sameRef = (a: NodeRef, b: NodeRef) => a.asset === b.asset && a.id === b.id;

type PointerLike = {
  pointerId: number;
  clientX: number;
  clientY: number;
  button?: number;
} & Modifiers;

function command(changes: AttributeChange[] | null, label: UndoLabel): SetAttributes | null {
  return changes && changes.length ? new SetAttributes(changes, label) : null;
}

/**
 * The pointer on the canvas (design 007 E2–E4, E6–E9, E13, E14): click / ⇧ / ⌘ selection with
 * hit testing, double click into groups, marquee, dragging handles, moving and scaling the
 * selection – every drag a gesture of the `GestureController`, every result one `setAttributes`.
 * Snapping and the BoundsGuard work in document space. Plain class (no DI); `CanvasView` owns it.
 */
export class CanvasInteraction {
  constructor(
    private readonly store: () => DocumentStore | null,
    private readonly view: CanvasViewStore,
    private readonly edit: CanvasEditStore,
    private readonly host: () => SVGSVGElement,
    private readonly layers: () => HTMLElement,
    private readonly mac: boolean,
    /** The clip path being edited (design 014 E7), `null` outside the mode. */
    private readonly clip: () => NodeRef | null = () => null,
  ) {}

  /** The live `<clipPath>` being edited. */
  private scope(): Element | null {
    const ref = this.clip();
    const el = ref ? (this.store()?.document().node(ref) ?? null) : null;
    return el?.localName === 'clipPath' ? el : null;
  }

  /** What a click selects: in the clip edit mode a shape of the clip, else per design 007 E3. */
  private selectable(store: DocumentStore, e: PointerLike) {
    const doc = store.document();
    const clip = this.clip();
    if (clip && this.scope()) {
      const hit = hitClipShape(doc, clip, e);
      return hit ? { ref: { asset: hit.asset, id: hit.id }, inContext: true } : null;
    }
    const hit = hitTest(this.layers(), e);
    return hit ? selectableRef(doc, hit, this.edit.context()) : null;
  }

  private toDoc = (c: { clientX: number; clientY: number }) => clientToDocument(this.host(), c);

  private snapOptions(mods: Modifiers): SnapOptions {
    const o = this.view.options();
    const off = mods.altKey; // ⌥ while dragging: no snapping
    return {
      zoom: this.view.zoom(),
      grid: o.snapToGrid && !off,
      magic: o.magicSnap && !off,
      origin: gridOriginPoint(o.gridOrigin),
    };
  }

  /** Left button pressed on the viewport; `true` = a drag may follow (capture the pointer). */
  down(e: PointerLike, target: Element | null): boolean {
    const store = this.store();
    if (!store || this.view.options().selectionMode === 'none') return false;
    const handle = target?.closest('[data-handle]')?.getAttribute('data-handle');
    if (handle) return this.startHandle(store, handle, e);
    const sel = this.selectable(store, e);
    if (!sel?.inContext && this.edit.context()) this.edit.context.set(null);
    const mode = selectModeOf(e, this.mac);
    if (!sel) {
      this.edit.gesture.start(this.marqueeOp(store, mode, this.toDoc(e)), store, e, this.toDoc);
      return true;
    }
    this.edit.activePoint.set(null);
    const was = store.selection().some((r) => sameRef(r, sel.ref));
    if (mode === 'replace' && !was) store.select([sel.ref]);
    else if (mode !== 'replace')
      store.select(combineSelection(store.selection(), [sel.ref], mode, sameRef));
    if (!store.selection().some((r) => sameRef(r, sel.ref))) return false;
    const op = this.moveOp(store, store.selection(), e);
    // a plain click on a node of a larger selection selects just that node
    if (mode === 'replace' && was) op.click = () => store.select([sel.ref]);
    this.edit.gesture.start(op, store, e, this.toDoc);
    return true;
  }

  move(e: PointerLike): void {
    this.edit.gesture.move(e);
  }

  up(e: PointerLike): void {
    this.edit.gesture.up(e);
  }

  /** Double click: into the group under the pointer (design 007 E3). */
  dblclick(e: PointerLike): void {
    const store = this.store();
    if (!store || this.view.options().selectionMode === 'none' || this.scope()) return;
    const doc = store.document();
    const hit = hitTest(this.layers(), e);
    const sel = hit ? selectableRef(doc, hit, this.edit.context()) : null;
    if (!hit || !sel || !isEnterable(doc.node(sel.ref))) return;
    this.edit.context.set(sel.ref);
    const inner = selectableRef(doc, hit, sel.ref);
    if (inner) store.select([inner.ref]);
  }

  /** Moving the selection (design 007 E11): snapped by its box points, kept on the canvas. */
  private moveOp(store: DocumentStore, refs: readonly NodeRef[], e: PointerLike): DragOp {
    const host = this.host();
    const doc = store.document();
    const scope = this.scope();
    const snaps = nodeSnaps(doc, host, refs, scope);
    const union = this.edit.model().union ?? this.unionOf(store, refs);
    const keys = union ? boxKeyPoints(union) : [];
    let candidates: Point[] | null = null;
    const p0 = this.toDoc(e);
    return {
      label: 'moveNode',
      update: (p, mods) => {
        candidates ??= magicPoints(this.layers(), host, doc, refs, scope);
        let d = { x: p.x - p0.x, y: p.y - p0.y };
        const s = snapMove(keys, d, candidates, this.snapOptions(mods));
        d = s.delta;
        this.edit.snap.set(
          s.target && s.kind !== 'none' ? { point: s.target, kind: s.kind } : null,
        );
        // the BoundsGuard keeps nodes on the canvas – not clip shapes (design 014 E7): a clip
        // moved partly off the canvas is how a picture gets cut
        if (union && !scope) d = clampTranslation(CANVAS_BOUNDS, union, d);
        return command(moveChanges(snaps, d), 'moveNode');
      },
      end: () => this.edit.snap.set(null),
    };
  }

  private unionOf(store: DocumentStore, refs: readonly NodeRef[]) {
    const host = this.host();
    const rects = paintedNodes(store.document(), refs, this.scope()).flatMap((el) =>
      el instanceof SVGGraphicsElement ? [nodeBoundsInDocument(host, el)] : [],
    );
    const r = rects.filter((x) => x !== null);
    if (!r.length) return null;
    const x = Math.min(...r.map((q) => q.x));
    const y = Math.min(...r.map((q) => q.y));
    return {
      x,
      y,
      width: Math.max(...r.map((q) => q.x + q.width)) - x,
      height: Math.max(...r.map((q) => q.y + q.height)) - y,
    };
  }

  /** Marquee on empty space (design 007 E4): nodes whose document bounds meet the rectangle. */
  private marqueeOp(store: DocumentStore, mode: SelectMode, p0: Point): DragOp {
    let rect: Rect | null = null;
    return {
      update: (p) => {
        rect = marqueeRect(p0, p);
        this.edit.marquee.set(rect);
        return null;
      },
      click: () => {
        if (mode !== 'replace') return;
        store.clearSelection();
        this.edit.context.set(null);
        this.edit.activePoint.set(null);
      },
      end: (committed) => {
        this.edit.marquee.set(null);
        if (committed && rect) {
          const r = rect;
          const hits = this.candidates(store)
            .filter((c) => intersects(r, c.rect))
            .map((c) => c.ref);
          store.select(combineSelection(store.selection(), hits, mode, sameRef));
        }
      },
    };
  }

  /** Children of the group context, else of every painted layer root. */
  private candidates(store: DocumentStore): { ref: NodeRef; rect: Rect }[] {
    const doc = store.document();
    const host = this.host();
    const scope = this.scope();
    if (scope) {
      // the clip path edit mode: its shapes only (design 014 E7)
      return [...scope.children].flatMap((c) => {
        const ref = doc.refOf(c);
        const rect = c instanceof SVGGraphicsElement ? nodeBoundsInDocument(host, c) : null;
        return ref && rect ? [{ ref, rect }] : [];
      });
    }
    const ctx = this.edit.context();
    const ctxEl = ctx ? doc.node(ctx) : null;
    const parents = ctxEl
      ? [{ root: doc.asset(ctx!.asset)!.svg!.root, el: ctxEl }]
      : paintedRoots(this.layers()).flatMap(({ asset }) => {
          const root = doc.asset(asset)?.svg?.root;
          return root ? [{ root, el: root as Element }] : [];
        });
    const seen = new Set<Element>();
    const out: { ref: NodeRef; rect: Rect }[] = [];
    for (const { root, el } of parents) {
      if (seen.has(el)) continue;
      seen.add(el);
      // a clip group of the layer is the layer level (design 014 E3): its children count
      const kids = [...el.children].flatMap((c) =>
        el === root && isClipGroup(c, root) ? [...c.children] : [c],
      );
      const refs = kids.flatMap((c) => doc.refOf(c) ?? []);
      for (const node of paintedNodes(doc, refs)) {
        if (!(node instanceof SVGGraphicsElement) || !isRendered(node, root)) continue;
        const rect = nodeBoundsInDocument(host, node);
        const ref = doc.refOf(node);
        if (rect && ref) out.push({ ref, rect });
      }
    }
    return out;
  }

  private startHandle(store: DocumentStore, key: string, e: PointerLike): boolean {
    const [si, ...rest] = key.split(':');
    const id = rest.join(':');
    const set = this.edit.model().sets[Number(si)];
    const h = set?.handles.find((x) => x.id === id);
    if (!set || !h) return false;
    const op = this.handleOp(store, set, h.id);
    if (!op) return false;
    this.edit.gesture.start(op, store, e, this.toDoc);
    return true;
  }

  private handleOp(store: DocumentStore, set: HandleSet, id: string): DragOp | null {
    const h = set.handles.find((x) => x.id === id)!;
    const inv = invert(set.toDoc);
    if (!inv) return null;
    const host = this.host();
    const doc = store.document();
    const scope = this.scope();
    const excluded =
      set.kind === 'box' && !set.single
        ? store.selection()
        : set.kind === 'box'
          ? [set.single!.ref]
          : [set.ref];
    let candidates: Point[] | null = null;
    // a handle that starts off the canvas may stay there (nothing jumps, design 007 E14)
    const bounds = withPoint(CANVAS_BOUNDS, apply(set.toDoc, h.local));
    const target = (p: Point, mods: Modifiers) => {
      candidates ??= magicPoints(this.layers(), host, doc, excluded, scope);
      const s = snapPoint(p, candidates, this.snapOptions(mods));
      this.edit.snap.set(s.target && s.kind !== 'none' ? { point: s.target, kind: s.kind } : null);
      return scope ? s.point : clampPoint(bounds, s.point);
    };
    const end = () => this.edit.snap.set(null);
    if (set.kind === 'point') {
      const { geometry: g, ref } = set;
      const label = dragLabel(h.role);
      return {
        label,
        update: (p, mods) => {
          const attrs = dragHandle(g, h.role, apply(inv, target(p, mods)));
          return command(
            attrs && Object.entries(attrs).map(([name, value]) => ({ ref, name, value })),
            label,
          );
        },
        click: (mods) => {
          const r = clickHandle(g, h.role, mods.altKey);
          if (r) {
            store.execute(
              new SetAttributes(
                Object.entries(r.attrs).map(([name, value]) => ({ ref, name, value })),
                r.label,
              ),
            );
            this.edit.activePoint.set(null);
          } else if (h.role.t === 'vertex' || h.role.t === 'pathAnchor') {
            this.edit.activePoint.set({ ref, role: h.role });
          }
        },
        end,
      };
    }
    if (set.kind === 'pivot') {
      return {
        label: 'changeTransform',
        update: (p, mods) => command(pivotChanges(set, target(p, mods)), 'changeTransform'),
        end,
      };
    }
    if (h.role.t !== 'box') return null;
    const handle = h.role.handle;
    if (set.single) {
      const n = { ...set.single, toDoc: set.toDoc, box: set.box };
      return {
        label: 'changeTransform',
        update: (p, mods) =>
          command(scaleNodeChanges(n, handle, target(p, mods)), 'changeTransform'),
        end,
      };
    }
    const snaps = nodeSnaps(doc, host, store.selection(), scope);
    return {
      label: 'changeTransform',
      update: (p, mods) =>
        command(scaleSelectionChanges(snaps, set.box, handle, target(p, mods)), 'changeTransform'),
      end,
    };
  }
}
