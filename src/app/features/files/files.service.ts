import { computed, effect, Injectable, inject, signal } from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { IconFileApi } from '../../core/icon-file/icon-file-api';
import { IconDocumentDto, IconFormat, SaveResult } from '../../core/icon-file/icon-file.models';
import { WindowApi } from '../../core/window/window-api';
import { AskService } from '../../shared/ask/ask.service';
import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { describeNotices, FILES_TEXTS as T } from './files-texts';
import { RecentFilesService } from './recent-files.service';
import { importSvg } from './svg-import';

/** Another file action runs (a dialog is open) – the AI is told so. */
function busyError() {
  return toFsError({ code: 'unavailable', message: 'another file action is running' });
}

/**
 * The file actions of one window (design 003 E8–E12): New, Open, Open Recent, Import SVG, Save,
 * Save As, Close, New Window – with the "save changes?" question, title and recent files. Holds
 * the `DocumentStore` of the window's one document. Root service: every window is its own
 * WebView. Actions run one at a time (a second click while a question is open does nothing).
 */
@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly api = inject(IconFileApi);
  private readonly win = inject(WindowApi);
  private readonly ask = inject(AskService);
  private readonly recent = inject(RecentFilesService);

  readonly store = signal<DocumentStore | null>(null);
  /** An action is running (dialogs, saving). */
  readonly busy = signal(false);
  /** Hints about the last opened/imported file (status line). */
  readonly notice = signal<string | null>(null);
  readonly title = computed(() => this.store()?.title() ?? T.untitled);
  readonly dirty = computed(() => this.store()?.dirty() ?? false);
  private readonly windowTitle = computed(
    () => {
      const s = this.store();
      return { title: this.title(), edited: this.dirty(), path: s?.document().path ?? null };
    },
    { equal: (a, b) => a.title === b.title && a.edited === b.edited && a.path === b.path },
  );

  constructor() {
    effect(() => {
      const t = this.windowTitle();
      if (this.store()) void this.win.setTitle(t.title, t.edited, t.path).catch(() => undefined);
    });
  }

  /** Called with the path after it was opened or saved and put into "Open Recent" (prompt 082). */
  private readonly recordedHooks = new Set<(path: string) => void>();

  /**
   * Window start: take over the close button, then the start file (argv, Finder, second start –
   * design 030) or – with `blank` – a new document. `true` if the window has a document now;
   * without one the app shows the start screen (design 082 E1).
   */
  async start(blank = true): Promise<boolean> {
    await this.win.takeOverClose().catch(() => undefined);
    await this.win.onCloseRequested(() => void this.closeRequested()).catch(() => undefined);
    const path = await this.win.startPath().catch(() => null);
    if (path && (await this.load(path))) return true;
    if (blank) await this.replaceWithNew();
    return this.store() !== null;
  }

  /** `fn(path)` after a file was opened or saved here (previews, design 082 E5); unsubscribes. */
  onRecorded(fn: (path: string) => void): () => void {
    this.recordedHooks.add(fn);
    return () => this.recordedHooks.delete(fn);
  }

  /**
   * A new, untitled document from a template (design 082 E7) – asks about unsaved changes like
   * "New". `false` when cancelled.
   */
  newFromTemplate(dto: IconDocumentDto): Promise<boolean> {
    return this.exclusive(async () => {
      if (!(await this.confirmDiscard())) return false;
      await this.replace(
        new DocumentStore(IconDocument.fromDto({ ...dto, path: null, name: null })),
      );
      this.notice.set(null);
      return true;
    }, false);
  }

  // ---- actions (registered in `file-actions.ts`, design 005 E17) ----

  newDocument(): Promise<void> {
    return this.exclusive(async () => {
      if (await this.confirmDiscard()) await this.replaceWithNew();
    });
  }

  newWindow(): Promise<void> {
    return this.exclusive(async () => {
      await this.win.openDocumentWindow(null).catch((e) => this.showError(T.windowFailed, e));
    });
  }

  open(): Promise<void> {
    return this.exclusive(async () => {
      const path = await this.api.pickOpenIcon(false).catch(() => null);
      if (path) await this.openHere(path);
    });
  }

  openRecent(path: string): Promise<void> {
    return this.exclusive(() => this.openHere(path));
  }

  importSvg(): Promise<void> {
    return this.exclusive(async () => {
      if (!this.store()) return;
      try {
        const path = await this.api.pickSvgFile();
        if (path) await this.importSvgNow(path);
      } catch (e) {
        await this.showError(T.importFailed, e);
      }
    });
  }

  /** "Import SVG" of a file dropped onto the window (design 071 E3), without a dialog. */
  importSvgFile(path: string): Promise<void> {
    return this.exclusive(async () => {
      if (!this.store()) await this.replaceWithNew();
      try {
        await this.importSvgNow(path);
      } catch (e) {
        await this.showError(T.importFailed, e);
      }
    });
  }

  private async importSvgNow(path: string): Promise<void> {
    const s = this.store();
    if (!s) return;
    const file = await this.api.readSvgFile(path);
    const result = importSvg(s.document(), file);
    if (!result) {
      await this.inform(T.importFailed, T.invalidSvg);
      return;
    }
    s.execute(result.command);
    this.notice.set(
      describeNotices(result.removed.map((code) => ({ code, name: result.assetName }))),
    );
  }

  /** Save (only when there is something to save); a new document asks for a path. */
  save(): Promise<boolean> {
    return this.exclusive(() => this.saveNow(), false);
  }

  saveAs(): Promise<boolean> {
    return this.exclusive(() => this.saveAsNow(), false);
  }

  /** Close the window (asks about unsaved changes); `false` if it stays open. */
  close(): Promise<boolean> {
    return this.exclusive(async () => {
      if (!(await this.confirmDiscard())) return false;
      const path = this.store()?.document().path;
      if (path) await this.api.closeIcon(path).catch(() => undefined);
      await this.win.closeWindow().catch(() => undefined);
      return true;
    }, false);
  }

  /**
   * The close button or Quit (design 005 E13) asks this window: close it, or – cancelled or busy
   * with another question – tell the backend, so that an ongoing Quit stops.
   */
  async closeRequested(): Promise<void> {
    if (!(await this.close())) await this.win.cancelQuit().catch(() => undefined);
  }

  /** Quit the app: the backend asks every window in turn (design 005 E13). */
  quit(): Promise<void> {
    return this.win.quit().catch(() => undefined);
  }

  // ---- AI control (design 018 E13/E14): no dialogs, errors are thrown as `FsError` ----

  /** Opens `path` in this window without asking or showing an error; throws the `FsError`. */
  async openQuietly(path: string): Promise<void> {
    if (this.busy()) throw busyError();
    return this.exclusive(async () => {
      const dto = await this.api.openIcon(path);
      const doc = IconDocument.fromDto(dto);
      await this.replace(new DocumentStore(doc));
      this.notice.set(describeNotices(doc.notices));
      await this.recorded(path);
    });
  }

  /**
   * Saves to `path` (default: the document's own) in `format` (default: the document's) without a
   * dialog. Throws the `FsError` – `invalid_path` for a new document without `path`.
   */
  async saveQuietly(path?: string, format?: IconFormat): Promise<SaveResult> {
    if (this.busy()) throw busyError();
    return this.exclusive(async () => {
      const s = this.store();
      if (!s) throw toFsError({ code: 'unknown_document', message: 'no document' });
      const doc = s.document();
      const target = path ?? doc.path;
      if (target === null) {
        throw toFsError({
          code: 'invalid_path',
          message: 'the document has no file yet: give a path',
        });
      }
      const old = doc.path;
      const result = await this.api.saveIcon(doc.saveRequest(target, format ?? doc.format));
      s.markSaved(result);
      if (old && old !== result.path) await this.api.closeIcon(old).catch(() => undefined);
      await this.recorded(result.path);
      return result;
    });
  }

  undo(): void {
    this.store()?.undo();
  }

  redo(): void {
    this.store()?.redo();
  }

  // ---- steps ----

  private async exclusive<R>(f: () => Promise<R>, whenBusy?: R): Promise<R> {
    if (this.busy()) return whenBusy as R;
    this.busy.set(true);
    try {
      return await f();
    } finally {
      this.busy.set(false);
    }
  }

  /** Open replaces an untouched new document, otherwise a new window (design 003 E8). */
  private async openHere(path: string): Promise<void> {
    const s = this.store();
    if (s?.document().path === path) return;
    if (s && !s.pristine()) {
      await this.win.openDocumentWindow(path).catch((e) => this.showError(T.openFailed(path), e));
      return;
    }
    if (await this.win.focusDocumentWindow(path).catch(() => false)) return;
    await this.load(path);
  }

  /** Opens `path` in this window; `false` (after telling the user) if it failed. */
  private async load(path: string): Promise<boolean> {
    try {
      const dto = await this.api.openIcon(path);
      const doc = IconDocument.fromDto(dto);
      await this.replace(new DocumentStore(doc));
      this.notice.set(describeNotices(doc.notices));
      await this.recorded(path);
      return true;
    } catch (e) {
      await this.showError(T.openFailed(path), e);
      return false;
    }
  }

  /** Into "Open Recent", then the hooks (their errors stay theirs). */
  private async recorded(path: string): Promise<void> {
    await this.recent.add(path).catch(() => undefined);
    for (const fn of this.recordedHooks) {
      try {
        fn(path);
      } catch {
        // a preview is never worth a failed open/save
      }
    }
  }

  private async replaceWithNew(): Promise<void> {
    try {
      const doc = IconDocument.fromDto(await this.api.newIcon());
      await this.replace(new DocumentStore(doc));
      this.notice.set(null);
    } catch (e) {
      await this.showError(T.openFailed(T.untitled), e);
    }
  }

  private async replace(next: DocumentStore): Promise<void> {
    const old = this.store()?.document().path;
    this.store.set(next);
    if (old && old !== next.document().path) await this.api.closeIcon(old).catch(() => undefined);
  }

  private async saveNow(): Promise<boolean> {
    const s = this.store();
    if (!s) return false;
    const doc = s.document();
    if (doc.path === null) return this.saveAsNow();
    if (!s.dirty()) return true;
    return this.saveTo(s, doc.path, doc.format);
  }

  private async saveAsNow(): Promise<boolean> {
    const s = this.store();
    if (!s) return false;
    const doc = s.document();
    const format = await this.askFormat(doc.format);
    if (!format) return false;
    const path = await this.api
      .pickSaveIcon(doc.name ?? `${T.untitled}.icon`, format)
      .catch(() => null);
    if (!path) return false;
    return this.saveTo(s, path, format);
  }

  private async saveTo(s: DocumentStore, path: string, format: IconFormat): Promise<boolean> {
    const doc = s.document();
    const old = doc.path;
    try {
      const result = await this.api.saveIcon(doc.saveRequest(path, format));
      s.markSaved(result);
      if (old && old !== result.path) await this.api.closeIcon(old).catch(() => undefined);
      await this.recorded(result.path);
      return true;
    } catch (e) {
      await this.showError(T.saveFailed, e);
      return false;
    }
  }

  /** `true`: go on (saved or discarded); `false`: the user cancelled or saving failed. */
  private async confirmDiscard(): Promise<boolean> {
    const s = this.store();
    if (!s?.dirty()) return true;
    const answer = await this.ask.ask({
      title: T.saveChangesTitle(this.title()),
      message: T.saveChangesMessage,
      buttons: [
        { id: 'discard', label: T.dontSaveButton },
        { id: 'cancel', label: T.cancelButton },
        { id: 'save', label: T.saveButton, primary: true },
      ],
      cancel: 'cancel',
    });
    if (answer === 'save') return this.saveNow();
    return answer === 'discard';
  }

  private async askFormat(current: IconFormat): Promise<IconFormat | null> {
    const answer = await this.ask.ask({
      title: T.formatTitle,
      message: T.formatMessage,
      buttons: [
        { id: 'cancel', label: T.cancelButton },
        { id: 'zip', label: T.formatZip, primary: current === 'zip' },
        { id: 'bundle', label: T.formatBundle, primary: current === 'bundle' },
      ],
      cancel: 'cancel',
    });
    return answer === 'bundle' || answer === 'zip' ? answer : null;
  }

  private async showError(title: string, e: unknown): Promise<void> {
    await this.inform(title, describeFsError(toFsError(e)));
  }

  private async inform(title: string, message: string): Promise<void> {
    await this.ask.ask({
      title,
      message,
      buttons: [{ id: 'ok', label: T.okButton, primary: true }],
      cancel: 'ok',
    });
  }
}
