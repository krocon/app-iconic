import { isLocked } from '../lock/lock';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { clientToDocument, nodeToDocument } from '../../shared/geometry/dom-geometry';
import { apply, fromDom, IDENTITY, invert, Matrix } from '../../shared/geometry/matrix';
import { CORNER_KINDS, cornersOf, radiusAt, widgetAt } from '../../shared/geometry/corners';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasTools } from '../canvas/canvas-tools';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DocCommand } from '../document/commands';
import { FilesService } from '../files/files.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { cornerSource } from './corner-source';
import { CornersService } from './corners.service';
import { CORNERS_TEXTS as T } from './corners-texts';

/** Widgets sit at least this far inside their corner (screen px, VectorCraft: a few). */
export const WIDGET_INSET_PX = 14;
/** Two presses on a widget within this time are a double click. */
export const DOUBLE_CLICK_MS = 400;
/** Corners with a side shorter than this on screen hide their widgets. */
export const MIN_SIDE_PX = 24;

/**
 * Live Corners widgets (prompt 045; VectorCraft `tools/src/corners.rs`): a small circle inside
 * each corner of the one selected rectangle, polygon or straight path. Dragging one rounds all
 * corners together (one undo step), Alt-click cycles round → inverted → chamfer, a double click
 * opens the Corners dialog. Its own `<svg>` in VIEWPORT pixels; only the widgets take the pointer.
 */
@Component({
  selector: 'app-corner-overlay',
  template: `
    <svg class="overlay" aria-hidden="true">
      @for (w of widgets(); track w.index) {
        <circle
          class="widget"
          data-testid="corner-widget"
          [attr.cx]="w.x"
          [attr.cy]="w.y"
          r="4.5"
          (pointerdown)="press($event, w.index)"
        >
          <title>{{ t.widget }}</title>
        </circle>
      }
    </svg>
  `,
  styles: `
    :host,
    .overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }
    .widget {
      pointer-events: all;
      cursor: pointer;
      fill: var(--ai-handle-stroke);
      stroke: var(--ai-handle-position);
      stroke-width: 1.5;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CornerOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  protected readonly t = T;
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly edit = inject(CanvasEditStore);
  private readonly tools = inject(CanvasTools);
  private readonly corners = inject(CornersService);
  private readonly dialogs = inject(DialogService);
  /** The last press on a widget (a second one soon after is a double click). */
  private lastPress: { index: number; time: number } | null = null;

  /** The one selected node with corners: its source and matrix (document). */
  private readonly target = computed(() => {
    const store = this.files.store();
    if (!store || this.tools.current()) return null;
    store.revision();
    this.toView();
    const refs = store.selection();
    const host = this.view.host;
    if (refs.length !== 1 || !host || store.gesture()) return null;
    const el = store.document().node(refs[0]);
    // no corner widgets on a locked node (prompt 064)
    const src = el && !isLocked(el) ? cornerSource(el) : null;
    const m = el instanceof SVGGraphicsElement ? nodeToDocument(host, el) : null;
    return src && m ? { ref: refs[0], src, toDoc: fromDom(m) } : null;
  });

  protected readonly widgets = computed(() => {
    const t = this.target();
    if (!t) return [];
    const v = this.toView();
    // screen pixels per local unit
    const k = Math.hypot(v.a, v.b) * Math.hypot(t.toDoc.a, t.toDoc.b);
    if (!(k > 0)) return [];
    return cornersOf(t.src.points, t.src.closed)
      .filter((c) => Math.min(c.lu, c.lv) * k >= MIN_SIDE_PX)
      .map((c) => {
        const p = apply(v, apply(t.toDoc, widgetAt(c, t.src.radius, WIDGET_INSET_PX / k)));
        return { index: c.index, x: p.x, y: p.y };
      });
  });

  protected press(e: PointerEvent, index: number): void {
    const t = this.target();
    const store = this.files.store();
    const host = this.view.host;
    const inv = t ? invert(t.toDoc) : null;
    const corner = t ? cornersOf(t.src.points, t.src.closed).find((c) => c.index === index) : null;
    if (!t || !store || !host || !inv || !corner || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    // a double click (the pointer is captured: the browser's dblclick goes to the viewport)
    const before = this.lastPress;
    this.lastPress = { index, time: e.timeStamp };
    if (before && before.index === index && e.timeStamp - before.time < DOUBLE_CLICK_MS) {
      this.lastPress = null;
      this.dialogs.show('corners');
      return;
    }
    (e.target as Element).closest<HTMLElement>('.viewport')?.setPointerCapture?.(e.pointerId);
    let last: DocCommand | null = null;
    this.edit.gesture.start(
      {
        label: 'roundCorners',
        update: (p) => {
          last = this.corners.command(t.ref, radiusAt(corner, apply(inv, p)), t.src.kind);
          return last;
        },
        click: (mods) => {
          if (!mods.altKey) return;
          const next = CORNER_KINDS[(CORNER_KINDS.indexOf(t.src.kind) + 1) % CORNER_KINDS.length];
          const cmd = this.corners.command(t.ref, t.src.radius, next);
          if (!cmd) return;
          store.execute(cmd);
          store.selection.set([this.corners.refAfter(cmd, t.ref)]);
        },
        end: (committed) => {
          if (committed && last) store.selection.set([this.corners.refAfter(last, t.ref)]);
        },
      },
      store,
      e,
      (c) => clientToDocument(host, c),
    );
  }
}
