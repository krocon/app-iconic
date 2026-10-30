import { computed, inject, Injectable, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import {
  assign,
  AssignResult,
  Assignment,
  changesFor,
  ChordMap,
  chordMap,
  defaults,
  deviates,
  deviations,
  removeChord,
  resetAction,
  setChords,
} from '../../core/actions/keymap-edit';
import { normalizeChord } from '../../core/actions/shortcut';
import { FsError, toFsError } from '../../core/errors/fs-error';
import { KeymapApi } from '../../core/menu/menu-api';

/**
 * Changes the shortcuts of the app (design 085): every edit is applied to this window at once
 * (the keymap, so keys, menus and tooltips follow), then written to `keymap.json` as the
 * deviations from the built-in keymaps (`save_keymap`); Rust tells every window
 * (`keymap-changed`). A failed save puts the shortcuts back and keeps the error for the dialog.
 */
@Injectable({ providedIn: 'root' })
export class KeymapEditor {
  private readonly actions = inject(ActionService);
  private readonly api = inject(KeymapApi);
  readonly os = this.actions.os;
  /** The shortcuts in force per action. */
  readonly map = computed(() => chordMap(this.actions.keymap()));
  /** The last save failed (shown in the dialog). */
  readonly error = signal<FsError | null>(null);
  /** The row recording a shortcut and the chord it replaces (`null` = adds one). */
  readonly target = signal<{ id: string; old: string | null } | null>(null);
  /** Saves in order: the last edit wins. */
  private queue: Promise<unknown> = Promise.resolve();

  /** The action's shortcuts differ from the built-in ones. */
  deviating(id: string): boolean {
    return deviates(this.map(), this.os, id);
  }

  /** Any shortcut differs from the built-in ones. */
  readonly changed = computed(() => Object.keys(deviations(this.map(), this.os)).length > 0);

  /** Gives `a.id` the chord (design 085 E5); a conflict without resolution changes nothing. */
  assign(a: Assignment): AssignResult {
    const r = assign(this.map(), this.os, a);
    if (r.ok) void this.commit(r.map);
    return r;
  }

  remove(id: string, chord: string): Promise<boolean> {
    return this.commit(removeChord(this.map(), id, chord));
  }

  /**
   * Exactly these shortcuts (written as in `keymap.json`, any order of modifiers); `false` if one
   * is no shortcut or blocked, or the action cannot be changed.
   */
  set(id: string, chords: readonly string[]): Promise<boolean> {
    const canonical = chords.map((c) => normalizeChord(c, this.os));
    if (canonical.some((c) => c === null)) return Promise.resolve(false);
    const next = setChords(this.map(), this.os, id, [...new Set(canonical as string[])]);
    return next ? this.commit(next) : Promise.resolve(false);
  }

  reset(id: string): Promise<boolean> {
    return this.commit(resetAction(this.map(), this.os, id));
  }

  resetAll(): Promise<boolean> {
    return this.commit(new Map(defaults(this.os)));
  }

  private commit(next: ChordMap): Promise<boolean> {
    const before = this.actions.overrides();
    this.actions.applyOverrides({ bindings: deviations(next, this.os) });
    this.error.set(null);
    const changes = changesFor(next, this.os);
    const run = this.queue.then(async () => {
      try {
        const saved = await this.api.save(changes);
        this.actions.applyOverrides(saved);
        return true;
      } catch (e) {
        this.actions.applyOverrides({ bindings: { ...before } });
        this.error.set(toFsError(e));
        return false;
      }
    });
    this.queue = run;
    return run;
  }
}
