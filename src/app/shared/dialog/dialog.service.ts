import { computed, Injectable, signal } from '@angular/core';

/** The dialogs of the app (one at a time). */
export type DialogKind =
  | 'about'
  | 'ask'
  | 'palette'
  | 'shortcuts'
  | 'svgSnippet'
  | 'svgSource'
  | 'optimizePath'
  | 'export'
  | 'textPath'
  | 'symbolPicker'
  | 'saveSymbol'
  | 'settings'
  | 'shapeSize'
  | 'corners'
  | 'pattern'
  | 'fillet'
  | 'offset'
  | 'transform'
  | 'mockups'
  | 'recovery';

/**
 * Geometric fine tuning with a live preview (prompt 073 E3): a non-modal popover beside what opened
 * it – the canvas stays usable (view, selection) while it is open.
 */
export const POPOVER_KINDS: ReadonlySet<DialogKind> = new Set([
  'corners',
  'pattern',
  'fillet',
  'offset',
  'transform',
  'optimizePath',
  // "In Context" (prompt 081): the scenes follow the canvas while it is edited
  'mockups',
]);

/** Where a popover is anchored (client pixels of the opener). */
export interface DialogAnchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Which dialog is open. Remembers the focused element on `show` and gives the focus back on
 * `close` (as in files-and-folders `dialog.service.ts`); a popover is anchored at it.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly open = signal<DialogKind | null>(null);
  /** The open dialog is a popover (prompt 073). */
  readonly popover = computed(() => {
    const k = this.open();
    return k !== null && POPOVER_KINDS.has(k);
  });
  /** A modal dialog owns the keyboard and the window. */
  readonly modal = computed(() => this.open() !== null && !this.popover());
  /** The opener's box (a popover sits beside it). */
  readonly anchor = signal<DialogAnchor | null>(null);
  private returnFocus: HTMLElement | null = null;

  show(kind: DialogKind): void {
    if (this.open() === null) {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      this.returnFocus = active instanceof HTMLElement ? active : null;
      let r = this.returnFocus?.getBoundingClientRect?.();
      // no small opener (a shortcut, the palette): the canvas – the popover sits at its top right
      if (!r || r.width > 360 || r.height > 360) {
        r = document.querySelector('app-canvas-view .viewport')?.getBoundingClientRect() ?? r;
      }
      this.anchor.set(
        r && (r.width || r.height)
          ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
          : null,
      );
    }
    this.open.set(kind);
  }

  close(options?: { restoreFocus?: boolean }): void {
    this.open.set(null);
    this.anchor.set(null);
    const target = options?.restoreFocus === false ? null : this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) {
      setTimeout(() => target.focus());
    }
  }
}
