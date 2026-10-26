import { DestroyRef, inject, Injectable } from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { FilesService } from './files.service';

/**
 * PROVISIONAL (design 003 E17) – replaced by the action catalogue and the `KeyboardDispatcher`
 * of prompt 005. The legacy file shortcuts (legacy §4) on ⌘ (macOS) or Ctrl (elsewhere). Not
 * while a dialog is open and not while typing in a field.
 */
@Injectable({ providedIn: 'root' })
export class ProvisionalShortcuts {
  private readonly files = inject(FilesService);
  private readonly dialogs = inject(DialogService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '');

  /** The key → action table (key = `[shift+]<key>` in lower case). */
  private readonly table: Record<string, () => unknown> = {
    n: () => this.files.newDocument(),
    'shift+n': () => this.files.newWindow(),
    o: () => this.files.open(),
    'shift+i': () => this.files.importSvg(),
    s: () => this.files.save(),
    'shift+s': () => this.files.saveAs(),
    w: () => this.files.close(),
    z: () => this.files.undo(),
    'shift+z': () => this.files.redo(),
    y: () => (this.mac ? undefined : this.files.redo()),
  };

  /** Entries of other features (canvas zoom, design 004 E15); returns the unregister function. */
  private readonly extra = new Map<string, () => unknown>();

  register(entries: Record<string, () => unknown>): () => void {
    for (const [k, f] of Object.entries(entries)) this.extra.set(k, f);
    return () => {
      for (const [k, f] of Object.entries(entries))
        if (this.extra.get(k) === f) this.extra.delete(k);
    };
  }

  install(): void {
    const handler = (e: KeyboardEvent) => this.onKey(e);
    document.addEventListener('keydown', handler);
    this.destroyRef.onDestroy(() => document.removeEventListener('keydown', handler));
  }

  /** Runs the action of `e` and returns whether it was one. */
  onKey(e: KeyboardEvent): boolean {
    const mod = this.mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod || e.altKey || this.dialogs.open() !== null || typing(e.target)) return false;
    const key = (e.shiftKey ? 'shift+' : '') + e.key.toLowerCase();
    const action = this.table[key] ?? this.extra.get(key);
    if (!action) return false;
    e.preventDefault();
    void action();
    return true;
  }
}

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
