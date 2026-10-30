import { SettingsApi } from '../app/core/settings/settings-api';
import { applyPatch, settingsFromJson } from '../app/core/settings/settings-rules';
import {
  DEFAULT_SETTINGS,
  LoadedSettings,
  Settings,
  SettingsChanged,
  SettingsPatch,
  ThemeChoice,
} from '../app/core/settings/settings.models';
import { ConfigWarning } from '../app/core/menu/menu.models';

/** Where the browser mode keeps its "settings.json" (design 015 E18). */
export const FAKE_SETTINGS_KEY = 'appIconic.settings';

/**
 * Test double of {@link SettingsApi} with the backend's rules (`settings-rules.ts` = Rust
 * `apply_patch`). With a `Storage` (browser mode) the settings survive a reload – the
 * "restart" of the Playwright tests. Never in app code.
 */
export class FakeSettingsApi extends SettingsApi {
  stored: Settings = DEFAULT_SETTINGS;
  warning: ConfigWarning | null = null;
  readonly saves: SettingsPatch[] = [];
  readonly themes: ThemeChoice[] = [];
  label = 'main';
  /** `save` fails (not writable). */
  failSave = false;
  private readonly listeners = new Set<(e: SettingsChanged) => void>();

  /** `first`: laid over the defaults while nothing is stored (browser mode, design 082 E9). */
  constructor(
    private readonly storage: Storage | null = null,
    first: SettingsPatch | null = null,
  ) {
    super();
    if (first) this.stored = applyPatch(DEFAULT_SETTINGS, first);
    try {
      const text = storage?.getItem(FAKE_SETTINGS_KEY);
      if (text) this.stored = settingsFromJson(JSON.parse(text));
    } catch {
      // a broken entry: the defaults
    }
  }

  async load(): Promise<LoadedSettings> {
    return { value: this.stored, warning: this.warning };
  }

  async save(patch: SettingsPatch): Promise<Settings> {
    if (this.failSave) throw { code: 'permission_denied', message: 'read-only' };
    this.saves.push(patch);
    this.store(applyPatch(this.stored, patch), this.label);
    return this.stored;
  }

  async reset(): Promise<Settings> {
    this.store(DEFAULT_SETTINGS, this.label);
    return this.stored;
  }

  /** Another window changed the settings (Rust's `settings-changed` event). */
  changeFromOtherWindow(patch: SettingsPatch, from = 'doc-2'): void {
    this.store(applyPatch(this.stored, patch), from);
  }

  async onChanged(fn: (e: SettingsChanged) => void): Promise<() => void> {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  windowLabel(): string {
    return this.label;
  }

  async setWindowTheme(theme: ThemeChoice): Promise<void> {
    this.themes.push(theme);
  }

  private store(s: Settings, from: string): void {
    this.stored = s;
    try {
      this.storage?.setItem(FAKE_SETTINGS_KEY, JSON.stringify(s));
    } catch {
      // storage full or blocked: in memory only
    }
    for (const l of this.listeners) l({ settings: s, from });
  }
}
