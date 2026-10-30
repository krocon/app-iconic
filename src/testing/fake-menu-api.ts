import { Injectable } from '@angular/core';
import { KeymapApi, MenuApi } from '../app/core/menu/menu-api';
import { KeymapChanges, KeymapOverrides, MenuSpec } from '../app/core/menu/menu.models';

/**
 * Test double of {@link MenuApi}: keeps the last spec, `click(id)` plays a click in the native
 * menu (design 005 E18). Never imported by app code.
 */
@Injectable()
export class FakeMenuApi extends MenuApi {
  specs: MenuSpec[] = [];
  private handler: ((id: string) => void) | null = null;

  get spec(): MenuSpec | null {
    return this.specs.at(-1) ?? null;
  }

  async setAppMenu(spec: MenuSpec): Promise<void> {
    this.specs.push(spec);
  }

  async onAction(fn: (id: string) => void): Promise<() => void> {
    this.handler = fn;
    return () => (this.handler = null);
  }

  click(id: string): void {
    this.handler?.(id);
  }
}

/** Where the browser mode keeps its "keymap.json" (design 085 E9). */
export const FAKE_KEYMAP_KEY = 'appIconic.keymap';

/**
 * Test double of {@link KeymapApi}: `save` applies the patch like Rust `keymap_file::save`
 * (entries not named stay) and tells every listener, as `keymap-changed` tells every window. With
 * a `Storage` (browser mode) the file lives there and other tabs – the "second window" – hear of a
 * change through the `storage` event (design 085 E9).
 */
export class FakeKeymapApi extends KeymapApi {
  overrides: KeymapOverrides = { bindings: {}, warning: null };
  saves: KeymapChanges[] = [];
  /** Set to make the next `save` fail with this error. */
  failWith: unknown = null;
  private readonly listeners = new Set<(o: KeymapOverrides) => void>();

  constructor(private readonly storage: Storage | null = null) {
    super();
    try {
      const text = storage?.getItem(FAKE_KEYMAP_KEY);
      if (text) this.overrides = { bindings: JSON.parse(text), warning: null };
    } catch {
      // broken: the defaults (Rust keeps it as `.bad`)
    }
  }

  async loadOverrides(): Promise<KeymapOverrides> {
    return this.overrides;
  }

  async save(changes: KeymapChanges): Promise<KeymapOverrides> {
    if (this.failWith) {
      const e = this.failWith;
      this.failWith = null;
      throw e;
    }
    this.saves.push(changes);
    const bindings = { ...this.overrides.bindings };
    for (const [id, chords] of Object.entries(changes)) {
      if (chords === null) delete bindings[id];
      else bindings[id] = [...chords];
    }
    this.overrides = { bindings, warning: null };
    try {
      this.storage?.setItem(FAKE_KEYMAP_KEY, JSON.stringify(bindings));
    } catch {
      // storage full or blocked: in memory only
    }
    for (const fn of this.listeners) fn(this.overrides);
    return this.overrides;
  }

  async onChanged(fn: (o: KeymapOverrides) => void): Promise<() => void> {
    this.listeners.add(fn);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== FAKE_KEYMAP_KEY) return;
      try {
        this.overrides = { bindings: e.newValue ? JSON.parse(e.newValue) : {}, warning: null };
        fn(this.overrides);
      } catch {
        // not ours to fix
      }
    };
    const win = this.storage ? globalThis.window : undefined;
    win?.addEventListener('storage', onStorage);
    return () => {
      this.listeners.delete(fn);
      win?.removeEventListener('storage', onStorage);
    };
  }
}
