import { Injectable, signal } from '@angular/core';
import { IconDocument, NodeRef } from '../document/icon-document';

/**
 * The clip path edit mode of this window (design 014 E7): which `<clipPath>` the canvas edits.
 * Root-provided like the `CanvasEditStore` and the `FreehandStore` (one canvas per window). While
 * set, clicks, marquee, handles, arrow keys and snapping work on the shapes of that clip only, and
 * "Add" puts new shapes into it.
 */
@Injectable({ providedIn: 'root' })
export class ClipEditStore {
  /** The `<clipPath>` being edited. */
  readonly target = signal<NodeRef | null>(null);

  enter(ref: NodeRef): void {
    this.target.set({ ...ref });
  }

  /** Leaves the mode; `false` if it was not on. */
  exit(): boolean {
    if (!this.target()) return false;
    this.target.set(null);
    return true;
  }

  /** The live `<clipPath>` element being edited in `doc`, `null` when off or gone. */
  scope(doc: IconDocument | null | undefined): Element | null {
    const t = this.target();
    const el = t && doc ? doc.node(t) : null;
    return el && el.localName === 'clipPath' ? el : null;
  }
}
