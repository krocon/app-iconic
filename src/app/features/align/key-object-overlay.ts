import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { nodeBoundsInDocument } from '../../shared/geometry/dom-geometry';
import { apply, IDENTITY, Matrix } from '../../shared/geometry/matrix';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { AlignService } from './align.service';

/** The key object (prompt 054) – a thick frame while "Align to: Key object" is chosen. */
@Component({
  selector: 'app-key-object-overlay',
  template: `
    @if (frame(); as f) {
      <svg class="overlay" aria-hidden="true" data-testid="key-object">
        <rect class="key" [attr.x]="f.x" [attr.y]="f.y" [attr.width]="f.w" [attr.height]="f.h" />
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
    .key {
      fill: none;
      stroke: var(--ai-handle-position);
      stroke-width: 3;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyObjectOverlay {
  /** Document → viewport pixels. */
  readonly toView = input<Matrix>(IDENTITY);
  private readonly align = inject(AlignService);
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);

  protected readonly frame = computed(() => {
    const store = this.files.store();
    const key = this.align.key();
    if (this.align.to() !== 'key' || !store || !key || store.selection().length < 2) return null;
    store.revision();
    const el = store.document().node(key);
    const host = this.view.host;
    const b = el instanceof SVGGraphicsElement && host ? nodeBoundsInDocument(host, el) : null;
    if (!b) return null;
    const a = apply(this.toView(), { x: b.x, y: b.y });
    const c = apply(this.toView(), { x: b.x + b.width, y: b.y + b.height });
    const pad = 4;
    return {
      x: Math.min(a.x, c.x) - pad,
      y: Math.min(a.y, c.y) - pad,
      w: Math.abs(c.x - a.x) + 2 * pad,
      h: Math.abs(c.y - a.y) + 2 * pad,
    };
  });
}
