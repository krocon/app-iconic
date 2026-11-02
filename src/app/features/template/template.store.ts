import { computed, Injectable, signal } from '@angular/core';
import { clampOpacity, TEMPLATE_OPACITY, TemplateImage, templatePlacement } from './template';

/**
 * The template of this window's canvas (prompt 087 E12): root-provided like `CanvasViewStore` –
 * every window is its own WebView with one canvas. A view state: it stays when another document
 * opens in the window and is not saved.
 */
@Injectable({ providedIn: 'root' })
export class TemplateStore {
  readonly image = signal<TemplateImage | null>(null);
  readonly visible = signal(true);
  readonly opacity = signal<number>(TEMPLATE_OPACITY.initial);
  readonly shown = computed(() => this.visible() && this.image() !== null);
  readonly placement = computed(() => {
    const img = this.image();
    return img ? templatePlacement(img.width, img.height) : null;
  });

  set(image: TemplateImage): void {
    this.image.set(image);
    this.visible.set(true);
  }

  clear(): void {
    this.image.set(null);
  }

  toggle(): void {
    if (this.image()) this.visible.update((v) => !v);
  }

  setOpacity(v: number): void {
    this.opacity.set(clampOpacity(v));
  }
}
