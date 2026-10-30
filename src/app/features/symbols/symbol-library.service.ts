import { inject, Injectable, signal } from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { SymbolLibraryApi } from '../../core/symbols/symbol-library-api';
import { LibrarySymbol, SymbolRef } from '../../core/symbols/symbol-library.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { nodeBoundsInDocument, nodeToDocument } from '../../shared/geometry/dom-geometry';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { FilesService } from '../files/files.service';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { MySymbolsProvider } from './my-symbols-provider';
import { captureMarkup, CapturePart } from './symbol-capture';

const T = TOOLS_TEXTS.symbol;

/** Tags typed as one text: separated by commas. */
export function parseTags(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** What a library change answers: the symbol, or why not (already a user text). */
export type LibraryResult = { ok: true; symbol?: LibrarySymbol } | { ok: false; error: string };

/**
 * The user's own symbols and the recently used ones (prompt 084, design E5–E12): the "My Symbols"
 * provider, save the selection, rename, delete, import/export a folder – all through the backend
 * (`SymbolLibraryApi`), which cleans every SVG. `recent` is shared by the windows (Rust file).
 */
@Injectable({ providedIn: 'root' })
export class SymbolLibraryService {
  private readonly api = inject(SymbolLibraryApi);
  private readonly files = inject(FilesService);
  private readonly canvas = inject(CanvasViewStore);
  private readonly dialogs = inject(DialogService);
  readonly mine = new MySymbolsProvider(() => this.fetch());
  readonly recent = signal<readonly SymbolRef[]>([]);
  /** Bumped after every change of the library (pickers recompute). */
  readonly version = signal(0);

  private async fetch(): Promise<LibrarySymbol[]> {
    const lib = await this.api.list();
    this.recent.set(lib.recent);
    this.version.update((v) => v + 1);
    return lib.symbols;
  }

  /** Reads the library and the recent symbols anew (the picker opens; another window changed it). */
  async refresh(): Promise<void> {
    try {
      this.mine.setAll(await this.fetch());
    } catch {
      // the picker shows what it had; the next opening tries again
    }
  }

  private failure(e: unknown): LibraryResult {
    return { ok: false, error: describeFsError(toFsError(e)) };
  }

  /** Remembers a used symbol (after inserting); errors only cost the entry. */
  async recordUse(ref: SymbolRef): Promise<void> {
    try {
      this.recent.set(await this.api.recordUse(ref));
    } catch {
      // not important enough to bother the user
    }
  }

  // ---- save the selection ----

  /** The selected nodes as symbol SVG; `null` without a document, selection or layout. */
  captureSelection(): string | null {
    const store = this.files.store();
    const host = this.canvas.host;
    if (!store || !host) return null;
    const doc = store.document();
    const parts: CapturePart[] = [];
    for (const ref of store.selection()) {
      const el = doc.node(ref);
      if (!(el instanceof SVGGraphicsElement) || el.closest('defs, clipPath, mask')) continue;
      const matrix = nodeToDocument(host, el);
      const bounds = nodeBoundsInDocument(host, el);
      if (matrix && bounds) parts.push({ el, matrix, bounds });
    }
    return captureMarkup(parts);
  }

  canSave(): boolean {
    return (this.files.store()?.selection().length ?? 0) > 0;
  }

  openSaveDialog(): void {
    this.dialogs.show('saveSymbol');
  }

  /** `symbols.save { name, tags? }`: saves the selection as a new symbol. */
  async saveSelection(name: string, tags: readonly string[]): Promise<LibraryResult> {
    const svg = this.captureSelection();
    if (!svg) return { ok: false, error: T.nothingToSave };
    try {
      const symbol = await this.api.save(name, [...tags], svg);
      await this.refresh();
      this.files.notice.set(T.saved(symbol.name));
      return { ok: true, symbol };
    } catch (e) {
      return this.failure(e);
    }
  }

  // ---- manage ----

  async rename(id: string, name: string, tags: readonly string[]): Promise<LibraryResult> {
    try {
      const symbol = await this.api.update(id, name, [...tags]);
      await this.refresh();
      return { ok: true, symbol };
    } catch (e) {
      return this.failure(e);
    }
  }

  async remove(id: string): Promise<LibraryResult> {
    try {
      const removed = await this.api.remove(id);
      await this.refresh();
      return removed ? { ok: true } : { ok: false, error: T.unknown };
    } catch (e) {
      return this.failure(e);
    }
  }

  /** Imports the SVG files of a folder the user picks; the outcome as notice. */
  async importFolder(): Promise<boolean> {
    try {
      const path = await this.api.pickFolder();
      if (path === null) return false;
      const r = await this.api.importFolder(path);
      await this.refresh();
      this.files.notice.set(T.imported(r.imported, r.skipped, r.full));
      return r.imported > 0;
    } catch (e) {
      this.files.notice.set(T.libraryFailed(describeFsError(toFsError(e))));
      return false;
    }
  }

  /** Writes the library into a new folder inside one the user picks. */
  async exportFolder(): Promise<boolean> {
    try {
      const path = await this.api.pickFolder();
      if (path === null) return false;
      const r = await this.api.exportFolder(path);
      this.files.notice.set(T.exported(r.count, r.folder));
      return true;
    } catch (e) {
      this.files.notice.set(T.libraryFailed(describeFsError(toFsError(e))));
      return false;
    }
  }

  /** The symbol `id` of the library, if listed. */
  has(id: string): boolean {
    return this.mine.info(id) !== undefined;
  }
}
