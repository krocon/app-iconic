import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { RecoveryApi } from '../../core/recovery/recovery-api';
import { RecoveryEntry } from '../../core/recovery/recovery.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { SettingsStore } from '../settings/settings.store';

/** A gesture in progress delays the snapshot by this much (design 083 E4). */
export const GESTURE_RETRY_MS = 1000;

/**
 * Recovery snapshots of this window's document (prompt 083, design E4–E8). While the document is
 * dirty, a snapshot is written at most `recovery.interval` seconds after a change (the first
 * change starts the timer; changes meanwhile ride along); a change during the write schedules the
 * next. The snapshot goes when the document is saved (clean again), replaced (New, Open, template,
 * restore) or the window closes after the question ("Don't Save" included); Rust removes the
 * rest of this process on a regular exit. Errors are quiet – a snapshot never disturbs work.
 * At start the first window offers the snapshots of apps that are gone (dialog `recovery`).
 */
@Injectable({ providedIn: 'root' })
export class RecoveryService {
  private readonly files = inject(FilesService);
  private readonly api = inject(RecoveryApi);
  private readonly settings = inject(SettingsStore);
  private readonly dialogs = inject(DialogService);

  /** The document the snapshot belongs to, its id and the revision it holds. */
  private tracked: DocumentStore | null = null;
  private id: string | null = null;
  private written = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The id a restore just took over – it belongs to the next document of the window. */
  private adopting: string | null = null;
  /** The window is closing: no more snapshots. */
  private stopped = false;
  /** The running write (tests wait for it). */
  pending: Promise<void> = Promise.resolve();
  /** What the dialog lists. */
  readonly entries = signal<RecoveryEntry[]>([]);

  constructor() {
    effect(() => {
      const store = this.files.store();
      const revision = store?.revision() ?? 0;
      const dirty = store?.dirty() ?? false;
      const interval = this.settings.settings().recovery.interval;
      untracked(() => this.sync(store, revision, dirty, interval));
    });
    this.files.onClosing(() => this.stop());
  }

  /** The snapshot id of the window's document now (tests, status). */
  get currentId(): string | null {
    return this.id;
  }

  /** Brings the timer and the snapshot in line with the document (called by the effect). */
  sync(store: DocumentStore | null, revision: number, dirty: boolean, interval: number): void {
    if (store !== this.tracked) {
      const old = this.id;
      this.clearTimer();
      this.tracked = store;
      this.id = store ? this.adopting : null;
      this.adopting = null;
      this.written = this.id ? revision : -1;
      if (old && old !== this.id) void this.drop(old);
    }
    if (!store || !dirty || this.stopped) {
      this.clearTimer();
      // saved (or undone to the saved state): the file has it all
      if (this.id && !dirty) {
        void this.drop(this.id);
        this.id = null;
        this.written = -1;
      }
      return;
    }
    if (interval <= 0 || revision === this.written || this.timer) return;
    this.schedule(interval * 1000);
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pending = this.snapshot();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async snapshot(): Promise<void> {
    const store = this.tracked;
    if (!store || !store.dirty() || this.stopped) return;
    if (store.inGesture) {
      this.schedule(GESTURE_RETRY_MS);
      return;
    }
    const revision = store.revision();
    const doc = store.document();
    const r = doc.saveRequest(doc.path ?? '', doc.format);
    let id: string;
    try {
      id = await this.api.write({
        id: this.id,
        path: doc.path,
        from: r.from ?? null,
        format: r.format,
        iconJson: r.iconJson,
        assets: r.assets,
      });
    } catch {
      return; // quiet: the next change tries again
    }
    if (this.tracked !== store || !store.dirty() || this.stopped) {
      // saved, replaced or closing meanwhile: this snapshot is not needed
      if (this.id === id) this.id = null;
      await this.drop(id);
      return;
    }
    this.id = id;
    this.written = revision;
    this.sync(store, store.revision(), true, this.settings.settings().recovery.interval);
  }

  private async drop(id: string): Promise<void> {
    await this.api.discard(id).catch(() => false);
  }

  /** The window closes (its document saved or discarded): the snapshot goes. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.clearTimer();
    await this.pending.catch(() => undefined);
    const id = this.id;
    this.id = null;
    if (id) await this.drop(id);
  }

  // ---- the offer (design 083 E5) ----

  /** At start: the first window of the app shows what apps that are gone left behind. */
  async offerAtStart(): Promise<void> {
    if ((await this.load(true)).length) this.dialogs.show('recovery');
  }

  /** File › Recover Unsaved Documents… */
  async show(): Promise<void> {
    await this.load(false);
    this.dialogs.show('recovery');
  }

  private async load(atStart: boolean): Promise<RecoveryEntry[]> {
    const list = await this.api.list(atStart).catch(() => []);
    this.entries.set(list);
    return list;
  }

  /** Restores `id` into this window (asks about unsaved changes like New). */
  async restore(id: string): Promise<boolean> {
    const ok = await this.files.restore(async () => {
      const r = await this.api.open(id);
      this.adopting = r.id;
      return r.document;
    });
    if (!ok) {
      this.adopting = null;
      await this.load(false);
      return false;
    }
    this.entries.update((l) => l.filter((e) => e.id !== id));
    this.dialogs.close();
    return true;
  }

  async discard(id: string): Promise<void> {
    await this.api.discard(id).catch(() => false);
    this.entries.update((l) => l.filter((e) => e.id !== id));
  }
}
