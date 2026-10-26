import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { CANVAS_SIZE, iconGuides } from '../../shared/geometry/icon-guides';

/** Styles inside each layer's shadow root. */
const LAYER_CSS = ':host{position:absolute;inset:0}svg,img{display:block;width:100%;height:100%}';

/**
 * PLACEHOLDER of the canvas until prompt 004 (design 003 E16): the 1024 × 1024 artboard, the
 * layers of the document stacked in group/layer order (first group at the bottom, as in the
 * legacy app) and the Apple icon guides on top. Every layer lives in its own shadow root, so
 * `<style>` and ids of one asset neither reach the app nor the other assets.
 */
@Component({
  selector: 'app-canvas-view',
  template: `
    <div class="stage" role="img" [attr.aria-label]="label">
      <svg class="paper" [attr.viewBox]="'0 0 ' + size + ' ' + size" aria-hidden="true">
        <rect [attr.width]="size" [attr.height]="size" rx="185" />
      </svg>
      <div #layers class="layers"></div>
      <svg class="guides" [attr.viewBox]="'0 0 ' + size + ' ' + size" aria-hidden="true">
        @for (l of guides.lines; track $index) {
          <line [attr.x1]="l.x1" [attr.y1]="l.y1" [attr.x2]="l.x2" [attr.y2]="l.y2" />
        }
        @for (c of guides.circles; track $index) {
          <circle [attr.cx]="c.cx" [attr.cy]="c.cy" [attr.r]="c.r" />
        }
      </svg>
    </div>
  `,
  styles: `
    :host {
      flex: 1;
      min-width: 0;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      background: var(--ai-workspace-bg);
    }
    .stage {
      position: relative;
      width: min(100%, 70vh);
      aspect-ratio: 1;
    }
    .paper,
    .layers,
    .guides {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .paper {
      fill: var(--color-surface);
      filter: drop-shadow(var(--ai-artboard-shadow));
    }
    .guides {
      pointer-events: none;
      overflow: visible;
      fill: none;
      stroke: var(--ai-guide);
      stroke-width: 1.5;
      opacity: 0.55;
      vector-effect: non-scaling-stroke;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CanvasView {
  readonly store = input<DocumentStore | null>(null);
  protected readonly size = CANVAS_SIZE;
  protected readonly guides = iconGuides();
  protected readonly label = `1024 × 1024 canvas with icon guides`;
  private readonly layers = viewChild.required<ElementRef<HTMLElement>>('layers');

  constructor() {
    effect(() => render(this.layers().nativeElement, this.store()?.document() ?? null));
  }
}

function render(box: HTMLElement, doc: IconDocument | null): void {
  box.replaceChildren();
  if (!doc) return;
  groups(doc.iconJson).forEach((g, gi) => {
    for (const l of layers(g)) {
      const name = l['image-name'];
      const asset = typeof name === 'string' ? doc.asset(name) : undefined;
      if (!asset) continue;
      const content = asset.svg
        ? box.ownerDocument.importNode(asset.svg.doc.documentElement, true)
        : asset.dataUrl
          ? Object.assign(box.ownerDocument.createElement('img'), { src: asset.dataUrl, alt: '' })
          : null;
      if (!content) continue;
      const host = box.ownerDocument.createElement('div');
      host.className = 'layer';
      host.dataset['asset'] = asset.name;
      host.dataset['group'] = String(gi);
      if (typeof l.opacity === 'number') host.style.opacity = String(l.opacity);
      const shadow = host.attachShadow({ mode: 'open' });
      const style = box.ownerDocument.createElement('style');
      style.textContent = LAYER_CSS;
      shadow.append(style, content);
      box.append(host);
    }
  });
}
