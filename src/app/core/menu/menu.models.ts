/**
 * The native menu (macOS, design 005 E6) – mirror of Rust `ai-core::menu_spec::MenuSpec`
 * (taken over from editlicious `core/menu/menu-api.ts`).
 */
export type MenuItemSpec =
  | {
      kind: 'action';
      id: string;
      label: string;
      accelerator?: string;
      enabled: boolean;
      checked?: boolean;
    }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; items: MenuItemSpec[] };

export interface MenuSpec {
  menus: { label: string; items: MenuItemSpec[] }[];
  /** Texts of the macOS app and Window menus (Rust `AppMenuSpec`, design 015 E14). */
  app?: AppMenuSpec;
}

export interface AppMenuSpec {
  about: string;
  settings: string;
  settingsAccelerator?: string;
  services: string;
  hide: string;
  hideOthers: string;
  showAll: string;
  quit: string;
  window: string;
  minimize: string;
  maximize: string;
}

/** A problem with a config file (Rust `config_file::ConfigWarning`). */
export interface ConfigWarning {
  code: 'broken' | 'unreadable';
  path: string | null;
}

/** `keymap.json` (Rust `keymap_file::KeymapOverrides`, design 005 E14). */
export interface KeymapOverrides {
  bindings: Record<string, string[]>;
  warning: ConfigWarning | null;
}
