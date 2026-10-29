import { inject, Injectable, signal } from '@angular/core';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FoundFace, LiveFillService } from './live-fill.service';
import { LIVE_FILL_TEXTS as T } from './live-fill-texts';

const DRAG_PX = 4;

/**
 * The Fill tool (prompt 060, Live Paint): hovering shows the enclosed area under the pointer, a
 * click fills it (or recolours its fill), dragging across areas fills them as one, Alt + click
 * removes. The fills stay live (`LiveFillService`).
 */
@Injectable({ providedIn: 'root' })
export class LiveFillTool implements CanvasTool {
  readonly id = 'fill';
  readonly on = signal(false);
  readonly color = signal('#0a84ff');
  /** The faces under the pointer / the drag (document units). */
  readonly faces = signal<readonly FoundFace[]>([]);
  readonly message = signal<string | null>(null);
  readonly ready = signal(false);
  private readonly service = inject(LiveFillService);
  private readonly view = inject(CanvasViewStore);
  private press0: { client: Point; points: Point[]; alt: boolean } | null = null;
  private dragging = false;

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

  toggle(): void {
    if (this.on()) {
      this.stop();
      return;
    }
    this.on.set(true);
    void this.service.ready().then(() => this.ready.set(true));
  }

  private clear(): void {
    this.faces.set([]);
    this.press0 = null;
    this.dragging = false;
  }

  private doc(e: ToolPointer): Point | null {
    const host = this.view.host;
    return host ? clientToDocument(host, e) : null;
  }

  press(e: ToolPointer): void {
    const p = this.doc(e);
    if (!p || !this.ready()) return;
    this.message.set(null);
    this.press0 = { client: { x: e.clientX, y: e.clientY }, points: [p], alt: e.altKey };
  }

  move(e: ToolPointer): void {
    const p = this.doc(e);
    if (!p || !this.ready()) return;
    const p0 = this.press0;
    if (p0 && !this.dragging) {
      this.dragging = Math.hypot(e.clientX - p0.client.x, e.clientY - p0.client.y) > DRAG_PX;
    }
    const f = this.service.faceAt(p);
    if (p0 && this.dragging && !p0.alt) {
      // collect one point per new face crossed
      if (f && !this.faces().some((x) => x.d === f.d && x.asset === f.asset)) {
        if (!this.faces().length || this.faces()[0].asset === f.asset) {
          p0.points.push(p);
          this.faces.update((fs) => [...fs, f]);
        }
      }
      return;
    }
    this.faces.set(f ? [f] : []);
  }

  release(): void {
    const p0 = this.press0;
    this.press0 = null;
    this.dragging = false;
    if (!p0 || !this.on()) return;
    const done = p0.alt
      ? this.service.remove(p0.points[0])
      : this.service.fill(p0.points, this.color());
    this.message.set(done || p0.alt ? null : T.noFace);
    this.faces.set([]);
  }

  leave(): void {
    if (!this.press0) this.faces.set([]);
  }

  escape(): boolean {
    if (!this.on()) return false;
    this.stop();
    return true;
  }

  hint(): string {
    return this.message() ?? (this.ready() ? T.hint : T.loading);
  }

  reset(): void {
    this.stop();
  }
}
