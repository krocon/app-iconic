import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { documentToClient } from '../../shared/geometry/dom-geometry';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { TEXT_SIZE } from '../commands/element-defaults';
import { FilesService } from '../files/files.service';
import { TextEdit } from './text-edit';
import { TEXT_TEXTS as T } from './text-texts';

/**
 * The field over a text being edited (prompt 075 E3): placed and sized from the browser's screen
 * matrix (position, font size × zoom, the computed font), a native `<textarea>` – IME, selection,
 * undo of the typing work as everywhere. Enter makes a new line; ⌘/Ctrl+Enter or leaving the
 * field finishes, Esc cancels.
 */
@Component({
  selector: 'app-text-edit-overlay',
  template: `
    @if (box(); as b) {
      <textarea
        #field
        class="field"
        data-testid="text-editor"
        spellcheck="false"
        [attr.aria-label]="t.editor"
        [style.left.px]="b.left"
        [style.top.px]="b.top"
        [style.min-width.px]="b.width"
        [style.font-size.px]="b.fontPx"
        [style.font-family]="b.family"
        [style.text-align]="b.align"
        [rows]="b.rows"
        [value]="b.value"
        (pointerdown)="$event.stopPropagation()"
        (dblclick)="$event.stopPropagation()"
        (keydown)="onKey($event)"
        (blur)="finish()"
      ></textarea>
    }
  `,
  styles: `
    .field {
      position: fixed;
      z-index: 25;
      box-sizing: content-box;
      padding: 0 2px;
      margin: 0;
      line-height: 1.2;
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-focus);
      border-radius: 2px;
      outline: none;
      resize: none;
      overflow: hidden;
      white-space: pre;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextEditOverlay {
  protected readonly t = T;
  private readonly edit = inject(TextEdit);
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');
  private done = false;

  protected readonly box = computed(() => {
    const e = this.edit.editing();
    this.view.view();
    if (!e) return null;
    const rows = Math.max(1, e.value.split('\n').length);
    const host = this.view.host;
    if (e.ref) {
      const el = this.files.store()?.document().node(e.ref) as SVGGraphicsElement | null;
      const m = el?.getScreenCTM?.();
      if (!el || !m) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const fontPx = (parseFloat(cs.fontSize) || 16) * Math.hypot(m.a, m.b);
      const anchor = el.getAttribute('text-anchor') ?? cs.getPropertyValue('text-anchor');
      return {
        left: r.left - 3,
        top: r.top - 2,
        width: Math.max(r.width + fontPx, 120),
        fontPx,
        family: cs.fontFamily,
        align: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
        rows,
        value: e.value,
      };
    }
    if (!host || !e.at) return null;
    const c = documentToClient(host, e.at);
    const m = host.getScreenCTM();
    const fontPx = (TEXT_SIZE / 2) * (m ? Math.hypot(m.a, m.b) : 1);
    return {
      left: c.clientX - 3,
      top: c.clientY - fontPx,
      width: 120,
      fontPx,
      family: 'system-ui, sans-serif',
      align: 'left',
      rows,
      value: e.value,
    };
  });

  constructor() {
    afterRenderEffect(() => {
      const f = this.field()?.nativeElement;
      if (f && document.activeElement !== f) {
        this.done = false;
        f.focus();
        f.select();
      }
    });
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.done = true;
      this.edit.cancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
      e.preventDefault();
      e.stopPropagation();
      this.finish();
    } else {
      // typing stays in the field (Space, Delete … are no canvas keys here)
      e.stopPropagation();
    }
  }

  protected finish(): void {
    if (this.done) return;
    this.done = true;
    const v = this.field()?.nativeElement.value ?? '';
    void this.edit.commit(v);
  }
}
