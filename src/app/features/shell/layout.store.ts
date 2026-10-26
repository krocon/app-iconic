import { Injectable, signal } from '@angular/core';

export type PanelId = 'commands' | 'hierarchy' | 'properties';

/**
 * Which side panels are shown (design 005 E12, legacy §9: all on; ⌘1/⌘2/⌘3). Root service: one
 * window, one layout. Widths and persistence follow in prompt 015.
 */
@Injectable({ providedIn: 'root' })
export class LayoutStore {
  readonly panels = signal<Record<PanelId, boolean>>({
    commands: true,
    hierarchy: true,
    properties: true,
  });

  toggle(panel: PanelId): void {
    this.panels.update((p) => ({ ...p, [panel]: !p[panel] }));
  }
}
