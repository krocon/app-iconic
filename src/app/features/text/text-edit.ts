import { inject, Injectable, signal } from '@angular/core';
import { Point } from '../../shared/geometry/view-transform';
import { clientToDocument } from '../../shared/geometry/dom-geometry';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { hitTest } from '../canvas/hit-test';
import { AddService } from '../commands/add.service';
import { TEXT_FONT, TEXT_SIZE } from '../commands/element-defaults';
import { CompositeCommand, ReplaceNode } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { isLocked } from '../lock/lock';
import { linesOf, newTextMarkup, textSetCommand } from './text-lines';

/** What is being edited: an existing `<text>` or a new one at a document point. */
export interface TextEditing {
  ref: NodeRef | null;
  at: Point | null;
  value: string;
}

/**
 * Editing text on the canvas (prompt 075 E3): a double click on a `<text>` (or the text tool's
 * click) opens a field over it (`TextEditOverlay`); finishing writes one undo step – `setText` /
 * the text with line `tspan`s, or a new `<text>` ("Add Text"). Cancel leaves nothing.
 */
@Injectable({ providedIn: 'root' })
export class TextEdit {
  readonly editing = signal<TextEditing | null>(null);
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly add = inject(AddService);

  /** The editable `<text>` under a client point (a `tspan` counts as its text). */
  textAt(p: { clientX: number; clientY: number }): NodeRef | null {
    const box = this.view.layers;
    const store = this.files.store();
    const hit = box && store ? hitTest(box, p) : null;
    const el = hit ? store!.document().node(hit)?.closest('text') : null;
    return el && !isLocked(el) ? store!.document().refOf(el) : null;
  }

  start(ref: NodeRef): boolean {
    const el = this.files.store()?.document().node(ref);
    if (!el || el.localName !== 'text') return false;
    this.editing.set({ ref, at: null, value: linesOf(el).join('\n') });
    return true;
  }

  startNew(clientX: number, clientY: number): void {
    const host = this.view.host;
    const at = host ? clientToDocument(host, { clientX, clientY }) : null;
    if (at) this.editing.set({ ref: null, at, value: '' });
  }

  cancel(): void {
    this.editing.set(null);
  }

  /** Finishes with `value`; `false` if nothing was written. */
  async commit(value: string): Promise<boolean> {
    const e = this.editing();
    this.editing.set(null);
    const store = this.files.store();
    if (!e || !store) return false;
    if (e.ref) return this.setText(e.ref, value);
    if (!value.trim() || !e.at) return false;
    const p = e.at;
    return this.add.insertBuilt('addText', { centerX: p.x, centerY: p.y }, (c) => [
      newTextMarkup(c.x, c.y, value, {
        'font-family': TEXT_FONT,
        'font-size': String(Math.round(TEXT_SIZE / 2)),
        fill: '#000000',
      }),
    ]);
  }

  /** `text.set { node, text }`: one undo step; the text stays selected. */
  setText(ref: NodeRef, value: string): boolean {
    const store = this.files.store();
    const cmd = store ? textSetCommand(store.document(), ref, value) : null;
    if (!store || !cmd) return false;
    store.execute(cmd);
    const inner = cmd instanceof CompositeCommand ? cmd.commands[0] : cmd;
    store.select([inner instanceof ReplaceNode ? (inner.newRef ?? ref) : ref]);
    return true;
  }
}
