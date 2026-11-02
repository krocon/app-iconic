import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { percentOf } from './template';
import { TemplateStore } from './template.store';

/**
 * The template over the painted layers (prompt 087 E12): fitted into the canvas, half transparent,
 * not clipped by the mask and never hit by the pointer. Lives in the artboard, so zoom and pan
 * move it with the canvas.
 */
@Component({
  selector: 'app-template-overlay',
  template: `
    @if (box(); as b) {
      <img
        class="template"
        alt=""
        aria-hidden="true"
        draggable="false"
        data-testid="canvas-template"
        [src]="store.image()!.dataUrl"
        [style.left.%]="b.x"
        [style.top.%]="b.y"
        [style.width.%]="b.width"
        [style.height.%]="b.height"
        [style.opacity]="store.opacity()"
      />
    }
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .template {
      position: absolute;
      display: block;
      user-select: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateOverlay {
  protected readonly store = inject(TemplateStore);
  protected readonly box = computed(() => {
    const p = this.store.placement();
    return this.store.shown() && p ? percentOf(p) : null;
  });
}
