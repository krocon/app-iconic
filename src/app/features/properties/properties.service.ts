import { inject, Injectable, signal } from '@angular/core';
import { AskService } from '../../shared/ask/ask.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { PROPERTIES_TEXTS as T } from './properties-texts';
import { PropertySession, resetCommand, setPropertyCommand } from './property-edit';
import { commonSpec } from './property-spec';
import { validValue } from './property-values';

/**
 * The editing side of the properties panel (design 009 E4, E8, E11): one field edit at a time as
 * a gesture (`edit` → `commit` / `cancel`), one-shot sets and resets, Reset All with a question –
 * for the panel and for the actions `properties.*` (AI rule). Root service: one window, one
 * document (`FilesService.store`).
 */
@Injectable({ providedIn: 'root' })
export class PropertiesService {
  private readonly files = inject(FilesService);
  private readonly askService = inject(AskService);
  private session: { store: DocumentStore; s: PropertySession } | null = null;

  /** Constrain proportions of width/height and rx/ry (design 009 E6), per window. */
  readonly constrainSize = signal(false);
  readonly constrainRadius = signal(false);

  get store(): DocumentStore | null {
    return this.files.store();
  }

  /** Constrain for a property (`width` → the size lock). */
  constrainFor(name: string): boolean {
    if (name === 'width' || name === 'height') return this.constrainSize();
    if (name === 'rx' || name === 'ry') return this.constrainRadius();
    return false;
  }

  /** Names the selection can set (the common spec). */
  names(store: DocumentStore): string[] {
    const doc = store.document();
    const tags = store.selection().flatMap((r) => doc.node(r)?.localName ?? []);
    return commonSpec(tags).map((d) => d.name);
  }

  /** A live value of field `name` (starts its gesture; another field's edit is committed first). */
  edit(name: string, value: string | null): boolean {
    const store = this.store;
    if (!store) return false;
    if (this.session && (this.session.store !== store || this.session.s.name !== name)) {
      this.commit();
    }
    this.session ??= { store, s: new PropertySession(store, store.selection(), name) };
    return this.session.s.edit(value, this.constrainFor(name));
  }

  commit(): void {
    this.session?.s.commit();
    this.session = null;
  }

  cancel(): void {
    this.session?.s.cancel();
    this.session = null;
  }

  /** `name = value` on the selection as one step (`properties.set`); `false` if refused. */
  set(name: string, value: string, constrain?: boolean): boolean {
    this.commit();
    const store = this.store;
    if (!store || !this.names(store).includes(name)) return false;
    const doc = store.document();
    const def = store
      .selection()
      .flatMap((r) => commonSpec([doc.node(r)?.localName ?? '']))
      .find((d) => d.name === name);
    if (def && !validValue(def, value)) return false;
    try {
      const cmd = setPropertyCommand(
        doc,
        store.selection(),
        name,
        value,
        constrain ?? this.constrainFor(name),
      );
      if (!cmd) return false;
      store.execute(cmd);
      return true;
    } catch {
      return false;
    }
  }

  /** Removes `name` from the selection (`properties.reset`). */
  reset(name: string): boolean {
    this.commit();
    const store = this.store;
    const cmd = store ? resetCommand(store.document(), store.selection(), [name]) : null;
    if (!store || !cmd) return false;
    store.execute(cmd);
    return true;
  }

  /** "Reset All Properties" – asks first unless `confirm` is `false` (AI, tests). */
  async resetAll(confirm = true): Promise<boolean> {
    this.commit();
    const store = this.store;
    if (!store || !store.selection().length) return false;
    if (confirm) {
      const answer = await this.askService.ask({
        title: T.resetAllTitle,
        message: T.resetAllMessage(store.selection().length),
        buttons: [
          { id: 'cancel', label: T.cancelButton },
          { id: 'reset', label: T.resetAllButton, primary: true },
        ],
        cancel: 'cancel',
      });
      if (answer !== 'reset') return false;
    }
    const cmd = resetCommand(store.document(), store.selection(), 'all', 'resetAllProperties');
    if (!cmd) return false;
    store.execute(cmd);
    return true;
  }

  /** Something of the selection can be reset. */
  canResetAll(store: DocumentStore): boolean {
    return resetCommand(store.document(), store.selection(), 'all') !== null;
  }
}
