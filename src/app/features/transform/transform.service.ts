import { inject, Injectable, signal } from '@angular/core';
import { nodeBoundsInDocument, nodeToDocument } from '../../shared/geometry/dom-geometry';
import { conjugate, fromDom, Matrix } from '../../shared/geometry/matrix';
import {
  Anchor,
  anchorPoint,
  Box,
  specMatrix,
  TransformSpec,
} from '../../shared/geometry/transform-ops';
import { prependAffine } from '../../shared/geometry/transform-text';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { AttributeChange, CompositeCommand, DocCommand, SetAttributes } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { isDefinitionElement } from '../document/model/reorder-rules';
import { FilesService } from '../files/files.service';
import { deletableNodes } from '../hierarchy/edit-operations';
import { patternCommand } from '../pattern/pattern-copies';

/** Where the change happens: a point (document units) or a reference point of the box(es). */
export type Pivot = Point | Anchor;

export interface TransformRequest {
  spec: TransformSpec;
  pivot: Pivot;
  /** Each element about its own box (else about the box of the selection). */
  each: boolean;
  /** Copies get the change, the originals stay. */
  copy: boolean;
}

interface Node {
  ref: NodeRef;
  el: Element;
  box: Box;
}

const union = (bs: readonly Box[]): Box | null => {
  if (!bs.length) return null;
  const x0 = Math.min(...bs.map((b) => b.x));
  const y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.width));
  const y1 = Math.max(...bs.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

/**
 * Transform (prompt 053): moves, rotates, scales and reflects the selected nodes in document
 * space about a pivot – the change goes in front of each node's own `transform` (in its parent's
 * space, so nested and rotated groups work), folded with a leading matrix. Copies like the
 * patterns (049). Previews as an undo gesture.
 */
@Injectable({ providedIn: 'root' })
export class TransformService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  /** The dialog's last request. */
  readonly last = signal<TransformRequest | null>(null);
  private previewing: { refs: readonly NodeRef[]; plan: Plan | null } | null = null;

  refs(): readonly NodeRef[] {
    return this.previewing?.refs ?? this.files.store()?.selection() ?? [];
  }

  canRun(): boolean {
    return this.refs().length > 0;
  }

  private toDoc = (parent: Element): Matrix | null => {
    const host = this.view.host;
    const m = host && parent instanceof SVGGraphicsElement ? nodeToDocument(host, parent) : null;
    return m ? fromDom(m) : null;
  };

  private nodes(): Node[] {
    const store = this.files.store();
    const host = this.view.host;
    if (!store || !host) return [];
    return deletableNodes(store.document(), this.refs())
      .filter((el) => !isDefinitionElement(el) && el instanceof SVGGraphicsElement)
      .flatMap((el) => {
        const box = nodeBoundsInDocument(host, el as SVGGraphicsElement);
        const ref = store.document().refOf(el);
        return box && ref ? [{ ref, el, box }] : [];
      });
  }

  /** The box of the selection (document units). */
  bounds(): Box | null {
    return union(this.nodes().map((n) => n.box));
  }

  pivotPoint(pivot: Pivot, box: Box | null): Point {
    if (typeof pivot !== 'string') return pivot;
    return box ? anchorPoint(box, pivot) : { x: 512, y: 512 };
  }

  plan(req: TransformRequest): Plan | null {
    const store = this.files.store();
    const nodes = this.nodes();
    if (!store || !nodes.length) return null;
    const all = union(nodes.map((n) => n.box));
    const matrixOf = (n: Node) =>
      specMatrix(req.spec, this.pivotPoint(req.pivot, req.each ? n.box : all));
    const doc = store.document();
    if (req.copy) {
      const plans = (req.each ? nodes : [null]).flatMap((n) => {
        const p = patternCommand(
          doc,
          n ? [n.ref] : nodes.map((x) => x.ref),
          [matrixOf(n ?? nodes[0])],
          this.toDoc,
          'transform',
        );
        return p ? [p] : [];
      });
      if (!plans.length) return null;
      return {
        command: new CompositeCommand(
          'transform',
          plans.map((p) => p.command),
        ),
        refs: () => plans.flatMap((p) => p.selection().nodes),
      };
    }
    const changes: AttributeChange[] = nodes.flatMap((n) => {
      const p = n.el.parentElement ? this.toDoc(n.el.parentElement) : null;
      const local = p ? conjugate(matrixOf(n), p) : null;
      return local
        ? [
            {
              ref: n.ref,
              name: 'transform',
              value: prependAffine(n.el.getAttribute('transform'), local) || null,
            },
          ]
        : [];
    });
    if (!changes.length) return null;
    return {
      command: new SetAttributes(changes, 'transform'),
      refs: () => nodes.map((n) => n.ref),
    };
  }

  /** At once (the AI's way). */
  apply(req: TransformRequest): boolean {
    const store = this.files.store();
    const plan = this.plan(req);
    if (!store || !plan) return false;
    store.execute(plan.command);
    store.selection.set(plan.refs());
    return true;
  }

  /** A live preview (dialog, drag): replaces the one before. */
  preview(req: TransformRequest): void {
    const store = this.files.store();
    if (!store) return;
    if (this.previewing) store.cancel();
    else this.previewing = { refs: [...store.selection()], plan: null };
    const plan = this.plan(req);
    this.previewing.plan = plan;
    store.begin('transform');
    if (plan) store.update(plan.command);
  }

  get busy(): boolean {
    return this.previewing !== null;
  }

  commit(): void {
    const store = this.files.store();
    const p = this.previewing;
    this.previewing = null;
    if (!store || !p) return;
    store.commit();
    if (p.plan) store.selection.set(p.plan.refs());
  }

  cancel(): void {
    const store = this.files.store();
    const p = this.previewing;
    this.previewing = null;
    if (!store || !p) return;
    store.cancel();
    store.selection.set(p.refs);
  }
}

export interface Plan {
  command: DocCommand;
  refs(): NodeRef[];
}
