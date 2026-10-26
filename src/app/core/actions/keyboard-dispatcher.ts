import { DestroyRef, inject, Injectable } from '@angular/core';
import { ActionContext } from './action-catalog';
import { ActionService } from './action.service';
import { chordOf } from './shortcut';

/** Where the keyboard is: contexts in order of preference. */
export type ContextProvider = (target: Element | null) => readonly ActionContext[];

const SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Inputs, text areas, selects and `contenteditable` (CodeMirror from prompt 011). */
export function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color'].includes(
      el.type,
    );
  }
  return (
    (el as HTMLElement).isContentEditable === true ||
    el.closest('[contenteditable]:not([contenteditable="false"]), .cm-editor') !== null
  );
}

/**
 * The one `keydown` listener of the app (design 005 E4, CLAUDE.md §4; taken over from editlicious
 * `keyboard-dispatcher.ts`, there from comic-commander design 008): event → chord → action of the
 * first context that has an enabled one. Widgets with their own keys (menus, lists, the modal's
 * focus trap) handle theirs first and call `preventDefault`; text fields keep everything except
 * `Mod` shortcuts and F keys – and even those for `nativeInText` actions; buttons keep
 * Space/Enter, sliders their arrows. New here: a disabled action lets the key through, and hold
 * actions (Space = pan) run while the key is down.
 */
@Injectable({ providedIn: 'root' })
export class KeyboardDispatcher {
  private readonly actions = inject(ActionService);
  private provider: ContextProvider = () => ['global'];
  private attached: Document | null = null;
  /** Hold actions running: key → action id. */
  private readonly held = new Map<string, string>();
  /** Alt pressed and released alone (Windows/Linux) focuses the menu bar. */
  private altAlone = false;

  setContextProvider(p: ContextProvider): void {
    this.provider = p;
  }

  private readonly destroyRef = inject(DestroyRef);

  attach(doc: Document): void {
    if (this.attached) return;
    this.attached = doc;
    const down = (e: KeyboardEvent) => this.handle(e);
    const up = (e: KeyboardEvent) => this.keyup(e);
    const menu = (e: MouseEvent) => this.contextMenu(e);
    const blur = () => this.releaseAll();
    doc.addEventListener('keydown', down);
    doc.addEventListener('keyup', up);
    doc.addEventListener('contextmenu', menu);
    doc.defaultView?.addEventListener('blur', blur);
    this.destroyRef.onDestroy(() => {
      doc.removeEventListener('keydown', down);
      doc.removeEventListener('keyup', up);
      doc.removeEventListener('contextmenu', menu);
      doc.defaultView?.removeEventListener('blur', blur);
    });
  }

  /**
   * The WebView's own menu (Back, Reload, Inspect Element) has no place in the app. Text fields
   * keep it (copy, paste).
   */
  contextMenu(e: MouseEvent): void {
    const target = e.target instanceof Element ? e.target : null;
    if (!isTextField(target)) e.preventDefault();
  }

  keyup(e: KeyboardEvent): void {
    const id = this.held.get(e.key);
    if (id) {
      this.held.delete(e.key);
      this.actions.release(id);
      e.preventDefault();
      return;
    }
    const alone = this.altAlone;
    this.altAlone = false;
    if (e.key !== 'Alt' || !alone || this.actions.os === 'mac') return;
    const target = e.target instanceof Element ? e.target : null;
    if (this.provider(target).includes('dialog')) return;
    if (this.actions.run('app.focusMenu')) e.preventDefault();
  }

  /** The window lost the focus: no key is held any more. */
  releaseAll(): void {
    for (const id of this.held.values()) this.actions.release(id);
    this.held.clear();
  }

  handle(e: KeyboardEvent): void {
    this.altAlone = e.key === 'Alt' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat;
    if (e.defaultPrevented || e.isComposing) return;
    if (this.held.has(e.key)) {
      // repeats of a held key
      e.preventDefault();
      return;
    }
    const target = e.target instanceof Element ? e.target : null;
    // a menu widget owns its keys
    if (target?.closest('[role="menu"],[role="menubar"],[role="listbox"]')) return;
    const chord = chordOf(e, this.actions.os);
    if (!chord) return;
    const hasMod =
      chord.startsWith('Mod+') || (this.actions.os === 'mac' && chord.startsWith('Ctrl+'));
    const text = isTextField(target);
    if (text && !hasMod && !/^(Shift\+)?F\d{1,2}$/.test(chord)) return;
    if (target instanceof HTMLButtonElement && (e.key === ' ' || e.key === 'Enter')) return;
    if (target instanceof HTMLInputElement && target.type === 'range' && SLIDER_KEYS.has(e.key)) {
      return;
    }
    const keymap = this.actions.keymap();
    for (const ctx of this.provider(target)) {
      const id = keymap.byContext[ctx].get(chord);
      if (!id || !this.actions.enabled(id)) continue;
      const def = this.actions.def(id);
      if (text && def?.nativeInText) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat && !def?.repeat) return;
      if (def?.hold) this.held.set(e.key, id);
      this.actions.run(id);
      return;
    }
  }
}
