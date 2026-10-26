import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Rect } from '../../shared/geometry/dom-geometry';
import { apply, IDENTITY, Matrix, multiply } from '../../shared/geometry/matrix';
import { Point } from '../../shared/geometry/view-transform';
import { ActivePoint } from './canvas-edit.store';
import { HANDLE_SIZE, HandleKind, roleId } from './handles/handle-types';
import { EMPTY_MODEL, SelectionModel } from './selection-measure';
import { sameRef } from './canvas-pointer';

interface ShownHandle {
  key: string;
  kind: HandleKind;
  x: number;
  y: number;
  size: number;
  label: string;
  active: boolean;
}

const pts = (ps: readonly Point[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * The overlay of the selection (design 007 E5): its own `<svg>` in VIEWPORT pixels over the
 * artboard – never in the document DOM. Frames (the local bbox of each node through its matrix:
 * rotated like the node), handles in screen size with the template's colours and sizes, control
 * lines, the marquee and the snap indicator. Only the handles take pointer events; their
 * `data-handle` (`<set>:<id>`) tells the canvas which one is pressed.
 */
@Component({
  selector: 'app-selection-overlay',
  template: `
    <svg class="overlay" aria-hidden="true" data-testid="selection-overlay">
      @for (f of frames(); track $index) {
        <polygon class="frame" [attr.points]="f" />
      }
      @for (t of ties(); track $index) {
        <line class="tie" [attr.x1]="t.x1" [attr.y1]="t.y1" [attr.x2]="t.x2" [attr.y2]="t.y2" />
      }
      @for (h of handles(); track h.key) {
        @if (h.kind === 'position' || h.kind === 'size') {
          <rect
            [class]="'handle ' + h.kind"
            [class.active]="h.active"
            [attr.data-handle]="h.key"
            [attr.data-kind]="h.kind"
            [attr.x]="h.x - h.size / 2"
            [attr.y]="h.y - h.size / 2"
            [attr.width]="h.size"
            [attr.height]="h.size"
          >
            <title>{{ h.label }}</title>
          </rect>
        } @else {
          <circle
            [class]="'handle ' + h.kind"
            [class.active]="h.active"
            [attr.data-handle]="h.key"
            [attr.data-kind]="h.kind"
            [attr.cx]="h.x"
            [attr.cy]="h.y"
            [attr.r]="h.size / 2"
          >
            <title>{{ h.label }}</title>
          </circle>
        }
      }
      @if (marqueeRect(); as m) {
        <rect
          class="marquee"
          data-testid="marquee"
          [attr.x]="m.x"
          [attr.y]="m.y"
          [attr.width]="m.width"
          [attr.height]="m.height"
        />
      }
      @if (snapPoint(); as s) {
        <g
          [class]="'snap ' + s.kind"
          data-testid="snap-indicator"
          [attr.data-x]="s.doc.x"
          [attr.data-y]="s.doc.y"
        >
          <circle [attr.cx]="s.x" [attr.cy]="s.y" r="6" />
          <line [attr.x1]="s.x - 9" [attr.y1]="s.y" [attr.x2]="s.x + 9" [attr.y2]="s.y" />
          <line [attr.x1]="s.x" [attr.y1]="s.y - 9" [attr.x2]="s.x" [attr.y2]="s.y + 9" />
        </g>
      }
    </svg>
  `,
  styleUrl: './selection-overlay.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectionOverlay {
  readonly model = input<SelectionModel>(EMPTY_MODEL);
  /** Document → viewport pixels (the host's screen CTM minus the viewport origin). */
  readonly toView = input<Matrix>(IDENTITY);
  readonly marquee = input<Rect | null>(null);
  readonly snap = input<{ point: Point; kind: string } | null>(null);
  readonly active = input<ActivePoint | null>(null);

  protected readonly frames = computed(() => {
    const v = this.toView();
    return this.model().frames.map((f) => pts(f.map((p) => apply(v, p))));
  });

  protected readonly handles = computed((): ShownHandle[] => {
    const v = this.toView();
    const active = this.active();
    return this.model().sets.flatMap((set, si) => {
      const m = multiply(v, set.toDoc);
      const ref = set.kind === 'box' ? null : set.ref;
      return set.handles.map((h) => {
        const p = apply(m, h.local);
        return {
          key: `${si}:${h.id}`,
          kind: h.kind,
          x: p.x,
          y: p.y,
          size: HANDLE_SIZE[h.kind],
          label: h.label,
          active: !!active && !!ref && sameRef(active.ref, ref) && roleId(active.role) === h.id,
        };
      });
    });
  });

  protected readonly ties = computed(() => {
    const v = this.toView();
    return this.model().sets.flatMap((set) => {
      const m = multiply(v, set.toDoc);
      return set.handles.flatMap((h) => {
        if (!h.tie) return [];
        const a = apply(m, h.local);
        const b = apply(m, h.tie);
        return [{ x1: a.x, y1: a.y, x2: b.x, y2: b.y }];
      });
    });
  });

  protected readonly marqueeRect = computed(() => {
    const r = this.marquee();
    if (!r) return null;
    const v = this.toView();
    const a = apply(v, { x: r.x, y: r.y });
    const b = apply(v, { x: r.x + r.width, y: r.y + r.height });
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  });

  protected readonly snapPoint = computed(() => {
    const s = this.snap();
    if (!s) return null;
    const p = apply(this.toView(), s.point);
    return { x: p.x, y: p.y, kind: s.kind, doc: s.point };
  });
}
