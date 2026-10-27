// Nach editlicious src/app/features/settings/settings.store.ts (Prompt 009): sofort anwenden,
// gebündelt speichern; neu: Patches und Änderungen anderer Fenster (Design 015 E4/E5).
import { inject, Injectable, signal } from '@angular/core';
import { ConfigWarning } from '../../core/menu/menu.models';
import { SettingsApi } from '../../core/settings/settings-api';
import {
  applyPatch,
  checkedValue,
  joinPatches,
  patchFor,
} from '../../core/settings/settings-rules';
import {
  DEFAULT_SETTINGS,
  Settings,
  SettingsChanged,
  SettingsPatch,
} from '../../core/settings/settings.models';

/** Bundled writes (a dragged splitter, held zoom keys). */
export const SAVE_DELAY = 400;

/**
 * The settings of the app (design 015 E5): loaded once at start, every change applied at once
 * (clamped by the same rules as Rust) and sent as one patch shortly after. Changes of other
 * windows arrive as events and replace the state – a patch of this window that is still waiting
 * stays on top.
 */
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly api = inject(SettingsApi, { optional: true });
  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly loaded = signal(false);
  /** A problem with `settings.json` (shown once). */
  readonly warning = signal<ConfigWarning | null>(null);
  private pending: SettingsPatch | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by every change of this window – an older answer of Rust must not undo a newer one. */
  private seq = 0;

  async load(): Promise<void> {
    try {
      const l = await this.api?.load();
      if (l) {
        this.settings.set(applyPatch(DEFAULT_SETTINGS, l.value));
        this.warning.set(l.warning);
      }
      await this.api?.onChanged((e) => this.changed(e));
    } catch {
      // no backend: the defaults
    }
    this.loaded.set(true);
  }

  /** Applies `patch` at once and saves it soon. */
  update(patch: SettingsPatch): void {
    const next = applyPatch(this.settings(), patch);
    if (JSON.stringify(next) === JSON.stringify(this.settings())) return;
    this.settings.set(next);
    this.seq++;
    this.pending = this.pending ? joinPatches(this.pending, patch) : patch;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY);
  }

  /** `settings.set { key, value }` (design 015 E11): `false` = unknown key or wrong kind. */
  set(key: string, value: unknown): boolean {
    if (checkedValue(this.settings(), key, value) === null) return false;
    this.update(patchFor(key, value)!);
    return true;
  }

  /** Sends the waiting patch now (also before the window goes). */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const patch = this.pending;
    this.pending = null;
    if (!patch || !this.api) return;
    const seq = this.seq;
    try {
      const stored = await this.api.save(patch);
      // Rust may have clamped something; a newer change of this window stays
      if (seq === this.seq) this.settings.set(stored);
    } catch {
      // not writable: the settings still apply for this run
    }
  }

  /** "Reset to Default" for every window. */
  async reset(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.seq++;
    this.settings.set(DEFAULT_SETTINGS);
    try {
      const stored = await this.api?.reset();
      if (stored) this.settings.set(stored);
    } catch {
      // not writable: the defaults still apply for this run
    }
  }

  /** `settings-changed` of any window (design 015 E4). */
  private changed(e: SettingsChanged): void {
    if (e.from === this.api?.windowLabel()) return;
    const base = applyPatch(DEFAULT_SETTINGS, e.settings);
    this.settings.set(this.pending ? applyPatch(base, this.pending) : base);
  }
}
