import { effect, inject, Injectable, signal } from '@angular/core';
import { CONSTRUCTION_ATTR } from '../construction/construction';
import { IconDocument, NodeRef } from '../document/icon-document';
import { ID_ATTR } from '../document/svg/node-ids';
import { FilesService } from '../files/files.service';
import { CanvasEditStore } from './canvas-edit.store';
import { CanvasViewStore } from './canvas-view.store';

/** How much what lies outside the isolated group fades (prompt 055). */
export const ISOLATION_DIM = 0.25;

const id = (v: string) => CSS.escape(v);

/**
 * The rules isolation adds to a layer showing `asset` (prompt 055): along the path from the root to
 * the group of the context everything beside the path fades; other assets fade completely.
 */
export function isolationCss(doc: IconDocument, ctx: NodeRef | null, asset: string): string {
  if (!ctx) return '';
  if (ctx.asset !== asset) return `.layer-host{opacity:${ISOLATION_DIM}}`;
  const el = doc.node(ctx);
  if (!el) return '';
  const rules: string[] = [];
  for (let n: Element = el; n.parentElement; n = n.parentElement) {
    const parent = n.parentElement.getAttribute(ID_ATTR);
    const self = n.getAttribute(ID_ATTR);
    if (!parent || !self) break;
    rules.push(
      `[${ID_ATTR}="${id(parent)}"]>:not([${ID_ATTR}="${id(self)}"]){opacity:${ISOLATION_DIM}}`,
    );
  }
  return rules.join('');
}

/**
 * Extra styles in every layer's shadow root (prompt 055): fading around an isolated group (the
 * canvas's group context) and hiding construction lines (View › Construction Lines). Only the
 * canvas; the document does not change.
 */
@Injectable({ providedIn: 'root' })
export class LayerStyleService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly edit = inject(CanvasEditStore);
  /** Construction lines are drawn (session setting, not saved). */
  readonly construction = signal(true);
  private frame = 0;

  constructor() {
    effect(() => {
      const store = this.files.store();
      store?.revision();
      const ctx = this.edit.context();
      const show = this.construction();
      cancelAnimationFrame(this.frame);
      // after the layers are (re)built for this revision
      this.frame = requestAnimationFrame(() => this.apply(store?.document() ?? null, ctx, show));
    });
  }

  private apply(doc: IconDocument | null, ctx: NodeRef | null, show: boolean): void {
    const box = this.view.layers;
    if (!box || !doc) return;
    for (const layer of box.querySelectorAll<HTMLElement>('.layer')) {
      const root = layer.shadowRoot;
      if (!root) continue;
      let style = root.querySelector<HTMLStyleElement>('style[data-extra]');
      if (!style) {
        style = layer.ownerDocument.createElement('style');
        style.setAttribute('data-extra', '');
        root.append(style);
      }
      const css =
        isolationCss(doc, ctx, layer.dataset['asset'] ?? '') +
        (show ? '' : `[${CONSTRUCTION_ATTR}]{display:none!important}`);
      if (style.textContent !== css) style.textContent = css;
    }
  }
}
