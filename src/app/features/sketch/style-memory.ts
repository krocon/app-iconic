import { inject, Injectable } from '@angular/core';
import { StyleKind, THIN_LINE } from '../../core/settings/settings.models';
import { IconDocument, NodeRef } from '../document/icon-document';
import { SettingsStore } from '../settings/settings.store';
import { readStyle, sameStyle, styleAttrs, styleKindOf } from './draw-style';

/**
 * The style memory (design 019 E12, E13): new shapes take the paint of the shape of their kind
 * that was drawn or changed last, kept in `settings.json` (`drawing.styles`) so it survives a
 * restart and reaches every window. Root service.
 */
@Injectable({ providedIn: 'root' })
export class StyleMemory {
  private readonly settings = inject(SettingsStore);

  /** The attributes for a new shape of `kind`. */
  attrs(kind: StyleKind): Record<string, string> {
    return styleAttrs(this.settings.settings().drawing?.styles[kind] ?? THIN_LINE);
  }

  /** Remembers the paint of `el` for its kind (nothing for text, images, groups …). */
  record(el: Element | null | undefined): void {
    // construction geometry (prompt 049/058) is transparent on purpose: not a paint to reuse
    if (!el || el.hasAttribute('data-construction')) return;
    const kind = styleKindOf(el);
    if (!kind) return;
    const now = this.settings.settings().drawing?.styles[kind];
    const style = readStyle(el);
    // a paint the shape does not state itself (CSS class, inherited, a gradient): keep the old one,
    // else the next shape would be filled black
    for (const k of ['fill', 'stroke'] as const) if (!style[k]) style[k] = now?.[k] ?? THIN_LINE[k];
    if (now && sameStyle(now, style)) return;
    this.settings.update({ drawing: { styles: { [kind]: style } } });
  }

  /** Remembers the paint of every node of `refs` (the last one of a kind wins). */
  recordRefs(doc: IconDocument, refs: readonly NodeRef[]): void {
    for (const r of refs) this.record(doc.node(r));
  }
}
