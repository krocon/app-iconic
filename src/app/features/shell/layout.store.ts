import { Injectable, signal } from '@angular/core';
import { DEFAULT_SETTINGS, PanelKey } from '../../core/settings/settings.models';
import { clampWidth } from './panel-width';

export type PanelId = PanelKey;

const DEFAULT_WIDTHS: Record<PanelId, number> = {
  commands: DEFAULT_SETTINGS.panels.commands.width,
  hierarchy: DEFAULT_SETTINGS.panels.hierarchy.width,
  properties: DEFAULT_SETTINGS.panels.properties.width,
};

/**
 * The side panels of the window (design 005 E12, 015 E10; legacy §9): shown or not (⌘1/⌘2/⌘3)
 * and their widths (160…480, defaults 260 / 260 / 300). Root service: one window, one layout;
 * `SettingsSync` keeps it in the settings.
 */
@Injectable({ providedIn: 'root' })
export class LayoutStore {
  readonly panels = signal<Record<PanelId, boolean>>({
    commands: true,
    hierarchy: true,
    properties: true,
  });
  readonly widths = signal<Record<PanelId, number>>({ ...DEFAULT_WIDTHS });

  toggle(panel: PanelId): void {
    this.panels.update((p) => ({ ...p, [panel]: !p[panel] }));
  }

  setWidth(panel: PanelId, px: number): void {
    const w = clampWidth(px);
    if (this.widths()[panel] !== w) this.widths.update((ws) => ({ ...ws, [panel]: w }));
  }

  resetWidth(panel: PanelId): void {
    this.setWidth(panel, DEFAULT_WIDTHS[panel]);
  }

  defaultWidth(panel: PanelId): number {
    return DEFAULT_WIDTHS[panel];
  }
}
