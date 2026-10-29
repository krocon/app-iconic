import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { apply, fromDom, IDENTITY, invert, Matrix, multiply } from '../../shared/geometry/matrix';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { chain } from './gradient-model';
import { dragHandle, gradientSpace, GradientHandle, handlesOf, HandleId } from './gradient-handles';
import { GradientService, GradientTarget } from './gradient.service';
import { GRADIENT_TEXTS as T } from './gradient-texts';

/** `gradientTransform` of the gradient (or the one it inherits) as a matrix – parsed by the browser. */
function transformOf(el: Element): Matrix {
  const g = chain(el).find((e) => e.hasAttribute('gradientTransform')) as
    SVGGradientElement | undefined;
  const m = g?.gradientTransform?.baseVal?.consolidate()?.matrix;
  return m ? fromDom(m) : IDENTITY;
}

/**
 * The gradient's handles on the canvas (prompt 032, "Edit on Canvas"): linear start → end, radial
 * centre, radius and focus. Dragging one changes the coordinates live – one undo step per drag.
 */
@Component({
  selector: 'app-gradient-overlay',
  template: `
    @if (shown(); as s) {
      <svg class="overlay" data-testid="gradient-handles">
        @if (s.line; as l) {
          <line
            class="axis"
            [attr.x1]="l[0].x"
            [attr.y1]="l[0].y"
            [attr.x2]="l[1].x"
            [attr.y2]="l[1].y"
          />
        }
        @if (s.circle; as c) {
          <circle class="axis" [attr.cx]="c.x" [attr.cy]="c.y" [attr.r]="c.r" />
        }
        @for (h of s.handles; track h.id) {
          <circle
            class="handle"
            [class.focus]="h.id === 'focus'"
            r="6"
            [attr.cx]="h.view.x"
            [attr.cy]="h.view.y"
            [attr.data-handle]="h.id"
            (pointerdown)="press($event, h.id)"
          >
            <title>{{ t.handles[h.id] }}</title>
          </circle>
        }
      </svg>
    }
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
    .axis {
      fill: none;
      stroke: var(--ai-handle-control);
      stroke-width: 1.5;
      stroke-dasharray: 5 3;
    }
    .handle {
      fill: var(--ai-handle-stroke);
      stroke: var(--ai-handle-position);
      stroke-width: 2;
      pointer-events: auto;
      cursor: move;
    }
    .handle.focus {
      stroke: var(--ai-handle-control);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GradientOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  private readonly gradient = inject(GradientService);
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  protected readonly t = T;

  /** The target and its gradient space in document units. */
  private readonly model = computed(() => {
    const store = this.files.store();
    if (!this.gradient.onCanvas() || !store) return null;
    store.revision();
    store.selection();
    const t = this.gradient.target(this.gradient.paint());
    const host = this.view.host;
    const el = t?.owner?.el;
    if (!t || !host || !(el instanceof SVGGraphicsElement)) return null;
    const m = nodeToDocument(host, el);
    if (!m) return null;
    let box: DOMRect;
    try {
      box = el.getBBox();
    } catch {
      return null;
    }
    const space = multiply(fromDom(m), gradientSpace(t.info.units, transformOf(t.info.el), box));
    return { t, space };
  });

  protected readonly shown = computed(() => {
    const m = this.model();
    if (!m) return null;
    const v = this.toView();
    const handles = handlesOf(m.t.info, m.space).map((h: GradientHandle) => ({
      ...h,
      view: apply(v, h.at),
    }));
    const line = m.t.info.kind === 'linear' ? [handles[0].view, handles[1].view] : null;
    const circle =
      m.t.info.kind === 'radial'
        ? {
            ...handles[0].view,
            r: Math.hypot(
              handles[1].view.x - handles[0].view.x,
              handles[1].view.y - handles[0].view.y,
            ),
          }
        : null;
    return { handles, line, circle };
  });

  protected press(e: PointerEvent, id: HandleId): void {
    const m = this.model();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    const back = invert(this.toView());
    if (e.button !== 0 || !m || !svg || !back) return;
    e.preventDefault();
    e.stopPropagation();
    const doc = svg.ownerDocument;
    const { t, space } = m;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const p = apply(back, { x: ev.clientX - r.left, y: ev.clientY - r.top });
      const attrs = dragHandle(t.info, space, id, p);
      if (!attrs) return;
      moved = true;
      this.gradient.begin();
      this.apply(t, attrs);
    };
    const up = () => {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      if (moved) this.gradient.end();
    };
    doc.addEventListener('pointermove', move);
    doc.addEventListener('pointerup', up);
  }

  private apply(t: GradientTarget, attrs: Record<string, string | null>): void {
    this.gradient.setAttributes(t, attrs);
  }
}
