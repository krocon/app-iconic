import { Injectable } from '@angular/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { call } from '../backend/call';
import { KeymapOverrides, MenuSpec } from './menu.models';

/** Event of a click in the native menu, sent to the focused window (design 005 E6). */
export const MENU_ACTION = 'menu-action';

/**
 * The native menu (macOS) of this window: its spec, and the clicks that come back as action ids
 * (design 005 E6; after editlicious `core/menu/menu-api.ts`). Tests use `FakeMenuApi`.
 */
export abstract class MenuApi {
  abstract setAppMenu(spec: MenuSpec): Promise<void>;
  abstract onAction(fn: (id: string) => void): Promise<() => void>;
}

@Injectable()
export class TauriMenuApi extends MenuApi {
  protected backend: typeof call = call;

  setAppMenu(spec: MenuSpec): Promise<void> {
    return this.backend<void>('set_app_menu', { spec });
  }

  onAction(fn: (id: string) => void): Promise<() => void> {
    return getCurrentWebviewWindow().listen<{ id: string }>(MENU_ACTION, (e) => fn(e.payload.id));
  }
}

/** `load_keymap_overrides` (design 005 E14). */
export abstract class KeymapApi {
  abstract loadOverrides(): Promise<KeymapOverrides>;
}

@Injectable()
export class TauriKeymapApi extends KeymapApi {
  protected backend: typeof call = call;

  loadOverrides(): Promise<KeymapOverrides> {
    return this.backend<KeymapOverrides>('load_keymap_overrides');
  }
}
