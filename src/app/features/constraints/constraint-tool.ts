import { computed, inject, Injectable, signal } from '@angular/core';
import { ConstraintType, fits } from '../../shared/geometry/constraints/constraints';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { ConstraintError, ConstraintService } from './constraint.service';
import { collectTargets, ConstraintTarget, nearestTarget } from './constraint-targets';
import { CONSTRAINT_TEXTS as T } from './constraint-texts';

/** Pick distance (screen px); a press beyond this is a drag. */
const PICK_PX = 8;
const DRAG_PX = 4;

/**
 * The constraint tool (prompt 059, like Fusion 360's sketch constraints): choose a relation or a
 * dimension in its bar, then click the points, lines and circles it needs – it is added when the
 * picks fit (and solved at once). Dragging a point of a constrained element moves it with the
 * solver keeping every constraint (one undo step).
 */
@Injectable({ providedIn: 'root' })
export class ConstraintTool implements CanvasTool {
  readonly id = 'constraint';
  readonly on = signal(false);
  readonly type = signal<ConstraintType>('coincident');
  readonly picks = signal<readonly ConstraintTarget[]>([]);
  readonly hover = signal<ConstraintTarget | null>(null);
  readonly message = signal<string | null>(null);
  /** Badges and driving dimensions are shown (View menu, on by default). */
  readonly visible = signal(true);
  /** The badge chosen in the overlay (Delete removes it). */
  readonly selected = signal<{ asset: string; id: string } | null>(null);
  private readonly service = inject(ConstraintService);
  private readonly view = inject(CanvasViewStore);
  private readonly files = inject(FilesService);
  private cache: { revision: number; list: ConstraintTarget[] } | null = null;
  private press0: { client: Point; target: ConstraintTarget | null } | null = null;
  private dragging = false;

  /** The points of constrained elements (the overlay shows them while the tool is on). */
  readonly points = computed(() => {
    if (!this.on()) return [];
    this.files.store()?.revision();
    return this.targets().filter((t) => t.kind === 'point' && t.cid);
  });

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.on();
  }

  stop(): void {
    this.on.set(false);
    this.clear();
  }

  /** On with `type` (off again if it already is the tool's type and `toggle`). */
  start(type?: ConstraintType, toggle = true): void {
    if (this.on() && toggle && (!type || type === this.type())) {
      this.stop();
      return;
    }
    if (type) this.type.set(type);
    this.clear();
    this.on.set(true);
  }

  private clear(): void {
    this.picks.set([]);
    this.hover.set(null);
    this.press0 = null;
    if (this.dragging) this.service.dragEnd();
    this.dragging = false;
  }

  targets(): ConstraintTarget[] {
    const store = this.files.store();
    const revision = store?.revision() ?? -1;
    if (!store) return [];
    if (this.cache?.revision !== revision) {
      this.cache = {
        revision,
        list: collectTargets(store.document(), this.view.layers, this.view.host),
      };
    }
    return this.cache.list;
  }

  private tol(): number {
    return PICK_PX / Math.max(this.view.zoom(), 1e-6);
  }

  private doc(e: ToolPointer): Point | null {
    const host = this.view.host;
    return host ? clientToDocument(host, e) : null;
  }

  /** What may be picked next for the current type. */
  private accepts = (t: ConstraintTarget): boolean => {
    const picks = this.picks();
    if (picks.length && picks[0].node.asset !== t.node.asset) return false;
    return fits(this.type(), [...picks.map((p) => p.kind), t.kind], false);
  };

  press(e: ToolPointer): void {
    const p = this.doc(e);
    if (!p) return;
    this.message.set(null);
    const t = nearestTarget(this.targets(), p, this.tol());
    this.press0 = { client: { x: e.clientX, y: e.clientY }, target: t };
  }

  move(e: ToolPointer): void {
    const p = this.doc(e);
    if (!p) return;
    const p0 = this.press0;
    if (
      p0?.target?.kind === 'point' &&
      p0.target.cid &&
      !this.dragging &&
      Math.hypot(e.clientX - p0.client.x, e.clientY - p0.client.y) > DRAG_PX
    ) {
      this.dragging = this.service.dragBegin(
        p0.target.node.asset,
        `${p0.target.cid}.${p0.target.part}`,
      );
    }
    if (this.dragging) {
      this.service.dragTo(p);
      return;
    }
    this.hover.set(nearestTarget(this.targets(), p, this.tol(), this.accepts));
  }

  release(): void {
    const p0 = this.press0;
    this.press0 = null;
    if (this.dragging) {
      this.dragging = false;
      this.service.dragEnd();
      return;
    }
    if (!p0 || !this.on()) return;
    const t = this.hover() ?? (p0.target && this.accepts(p0.target) ? p0.target : null);
    if (t) this.pick(t);
  }

  /** Adds a pick; when the picks fit the type, the constraint is added. */
  pick(t: ConstraintTarget): ConstraintError | true | null {
    if (!this.accepts(t)) return null;
    const picks = [...this.picks(), t];
    if (
      !fits(
        this.type(),
        picks.map((p) => p.kind),
      )
    ) {
      this.picks.set(picks);
      return null;
    }
    this.picks.set([]);
    const r = this.service.add(
      this.type(),
      picks.map((p) => ({ node: p.node, part: p.part })),
    );
    this.message.set(r === true ? null : T.errors[r]);
    return r;
  }

  leave(): void {
    this.hover.set(null);
  }

  escape(): boolean {
    if (!this.on()) return false;
    if (this.picks().length) this.picks.set([]);
    else this.stop();
    return true;
  }

  hint(): string {
    return this.message() ?? T.hint(T.types[this.type()], T.picks[this.type()]);
  }

  reset(): void {
    this.stop();
  }
}
