import { Injectable } from '@angular/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { call } from '../backend/call';
import {
  LoadedSettings,
  Settings,
  SettingsChanged,
  SettingsPatch,
  ThemeChoice,
} from './settings.models';

/** Event of a settings change, sent to every window (design 015 E4). */
export const SETTINGS_CHANGED = 'settings-changed';

/**
 * `settings.json` (design 015; after editlicious `core/settings/settings-api.ts`): load once,
 * send patches, reset, hear the changes of every window, theme of the window frame. Tests and
 * the browser mode use `FakeSettingsApi`.
 */
export abstract class SettingsApi {
  abstract load(): Promise<LoadedSettings>;
  /** Lays `patch` over the current settings; returns them as stored (checked, clamped). */
  abstract save(patch: SettingsPatch): Promise<Settings>;
  abstract reset(): Promise<Settings>;
  /** Every change of any window (this one included – `from` says which). */
  abstract onChanged(fn: (e: SettingsChanged) => void): Promise<() => void>;
  /** The label of this window (to recognise its own changes). */
  abstract windowLabel(): string;
  abstract setWindowTheme(theme: ThemeChoice): Promise<void>;
}

@Injectable()
export class TauriSettingsApi extends SettingsApi {
  /** The bridge (`call.ts`); a test replaces it to check the argument names. */
  protected backend: typeof call = call;

  load(): Promise<LoadedSettings> {
    return this.backend<LoadedSettings>('load_settings');
  }

  save(patch: SettingsPatch): Promise<Settings> {
    return this.backend<Settings>('save_settings', { patch });
  }

  reset(): Promise<Settings> {
    return this.backend<Settings>('reset_settings');
  }

  onChanged(fn: (e: SettingsChanged) => void): Promise<() => void> {
    // an app-wide event (Rust `app.emit`): every window hears it
    return listen<SettingsChanged>(SETTINGS_CHANGED, (e) => fn(e.payload));
  }

  windowLabel(): string {
    return getCurrentWebviewWindow().label;
  }

  setWindowTheme(theme: ThemeChoice): Promise<void> {
    return this.backend<void>('set_window_theme', { theme });
  }
}
