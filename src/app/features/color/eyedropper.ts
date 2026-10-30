import { inject, Injectable, signal } from '@angular/core';
import { ExportApi } from '../../core/export/export-api';
import { browserColor, toHex, toRgba } from '../../shared/controls/color-value';
import { clientToDocument, documentToClient } from '../../shared/geometry/dom-geometry';
import { CanvasTool, CanvasTools, ToolPointer } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { hitTest } from '../canvas/hit-test';
import { SetAttributes } from '../document/commands';
import { exportSvg } from '../export/export-svg';
import { FilesService } from '../files/files.service';
import { editableRefs } from '../lock/lock';
import { COLOR_TEXTS as T } from './color-texts';

export type PickTarget = 'fill' | 'stroke';

/** A computed paint as `#RRGGBB(AA)`; `null` for `none`, a reference or nothing known. */
export function paintHex(css: string | null | undefined): string | null {
  const s = (css ?? '').trim();
  if (!s || s === 'none' || /^url\(/i.test(s)) return null;
  const c = toRgba(s, browserColor);
  return c && c.a > 0 ? toHex(c) : null;
}

/**
 * The eyedropper (prompt 074 E3, Shift+I): a click on the canvas takes the colour under the
 * pointer into the selection – the fill (Shift: the stroke). A plain colour comes from the element
 * hit (its computed `fill` / `stroke`, so inherited and CSS colours count); on an image or a
 * gradient resvg renders the icon and the pixel is taken (`pick_color`). One undo step
 * ("Change Fill" / "Change Stroke"); `color.pick { x, y, target }` does the same for the AI.
 */
@Injectable({ providedIn: 'root' })
export class Eyedropper implements CanvasTool {
  readonly id = 'eyedropper';
  readonly on = signal(false);
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly api = inject(ExportApi);

  constructor() {
    inject(CanvasTools).register(this);
  }

  active(): boolean {
    return this.on();
  }

  stop(): void {
    this.on.set(false);
  }

  toggle(): void {
    this.on.update((v) => !v);
  }

  press(e: ToolPointer): void {
    void this.pickAtClient(e.clientX, e.clientY, e.shiftKey ? 'stroke' : 'fill');
  }

  move(): void {
    // a click picks; moving does nothing
  }

  release(): void {
    // picked on press
  }

  leave(): void {
    // nothing to clear
  }

  escape(): boolean {
    if (!this.on()) return false;
    this.stop();
    return true;
  }

  hint(): string {
    return T.eyedropperHint;
  }

  /** The colour at a document point (the AI's way). */
  async pickAt(x: number, y: number, target: PickTarget): Promise<boolean> {
    const host = this.view.host;
    const c = host ? documentToClient(host, { x, y }) : null;
    return c ? this.pickAtClient(c.clientX, c.clientY, target) : false;
  }

  /** The colour under the client point; `null` = none. */
  async colorAt(clientX: number, clientY: number): Promise<string | null> {
    const box = this.view.layers;
    const host = this.view.host;
    const store = this.files.store();
    if (!box || !host || !store) return null;
    const hit = hitTest(box, { clientX, clientY });
    const el = hit ? store.document().node(hit) : null;
    if (el && el.localName !== 'image') {
      const cs = getComputedStyle(el);
      const fill = paintHex(cs.fill);
      // a shape with a plain fill: that colour; a pure stroke: its colour
      if (fill) return fill;
      if (cs.fill === 'none' || cs.fill === '') {
        const stroke = paintHex(cs.stroke);
        if (stroke) return stroke;
      }
    }
    // an image, a gradient, a pattern – or nothing hit: the rendered pixel
    const p = clientToDocument(host, { clientX, clientY });
    if (!p) return null;
    const svg = exportSvg(
      store.document(),
      this.view.options().appearance === 'dark' ? 'dark' : 'light',
      {
        mask: 'none',
        effects: false,
      },
    );
    try {
      const px = await this.api.pickColor(svg, p.x, p.y);
      const c = toRgba(px);
      return c && c.a > 0 ? toHex(c) : null;
    } catch {
      return null;
    }
  }

  async pickAtClient(clientX: number, clientY: number, target: PickTarget): Promise<boolean> {
    const store = this.files.store();
    if (!store) return false;
    const refs = editableRefs(store.document(), store.selection());
    if (!refs.length) {
      this.files.notice.set(T.eyedropperNothing);
      return false;
    }
    const color = await this.colorAt(clientX, clientY);
    if (!color) {
      this.files.notice.set(T.eyedropperMiss);
      return false;
    }
    store.execute(
      new SetAttributes(
        refs.map((ref) => ({ ref, name: target, value: color })),
        target === 'fill' ? 'changeFill' : 'changeStroke',
      ),
    );
    return true;
  }
}
