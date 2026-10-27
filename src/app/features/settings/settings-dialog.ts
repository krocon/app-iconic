// Nach editlicious src/app/features/settings/settings-dialog.ts (Prompt 009).
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { PNG_SIZES } from '../../core/export/export.models';
import { PanelKey, PANEL_MAX, PANEL_MIN } from '../../core/settings/settings.models';
import { AskService } from '../../shared/ask/ask.service';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { zoomPercent } from '../../shared/geometry/zoom-steps';
import { SHELL_TEXTS } from '../shell/shell-texts';
import { confirmReset } from './settings-actions';
import { SETTINGS_TEXTS } from './settings-texts';
import { SettingsStore } from './settings.store';
import { ACTION_TOGGLES, SECTIONS, SectionId, ZOOM_CHOICES } from './settings-view';

/**
 * Settings (⌘,; design 015 E12): sections General, Canvas, Snapping, Export, Advanced as
 * vertical tabs (WAI-ARIA APG: ↑/↓/Home/End move, the panel follows). Every change applies at
 * once and is saved for every window – only "Close".
 */
@Component({
  selector: 'app-settings-dialog',
  imports: [Modal],
  templateUrl: './settings-dialog.html',
  styleUrl: './settings-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDialog {
  protected readonly dialogs = inject(DialogService);
  protected readonly store = inject(SettingsStore);
  private readonly ask = inject(AskService);
  protected readonly actions = inject(ActionService);
  protected readonly t = SETTINGS_TEXTS;
  protected readonly shell = SHELL_TEXTS;
  protected readonly sections = SECTIONS;
  protected readonly section = signal<SectionId>('general');
  protected readonly s = computed(() => this.store.settings());
  protected readonly panelKeys: readonly PanelKey[] = ['commands', 'hierarchy', 'properties'];
  protected readonly toggles = ACTION_TOGGLES;
  protected readonly zooms = ZOOM_CHOICES;
  protected readonly sizes = PNG_SIZES;
  protected readonly min = PANEL_MIN;
  protected readonly max = PANEL_MAX;

  protected set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected checked(e: Event): boolean {
    return (e.target as HTMLInputElement).checked;
  }

  /** A number field: whole numbers only where the setting is one; empty or bad = no change. */
  protected number(key: string, e: Event, whole = true): void {
    const n = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(n) || (e.target as HTMLInputElement).value.trim() === '') return;
    this.set(key, whole ? Math.round(n) : n);
  }

  protected zoomLabel(z: number): string {
    return zoomPercent(z);
  }

  protected panelName(p: PanelKey): string {
    return this.shell[p];
  }

  protected toggleList<T>(key: string, list: readonly T[], item: T, on: boolean): void {
    const next = on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item);
    if (next.length) this.set(key, next);
  }

  /** Tabs: arrows move and select (automatic activation). */
  protected tabKey(e: KeyboardEvent): void {
    const i = SECTIONS.indexOf(this.section());
    const n = SECTIONS.length;
    const next =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? (i + 1) % n
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? (i - 1 + n) % n
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    this.section.set(SECTIONS[next]);
    const tab = (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(
      `#settings-tab-${SECTIONS[next]}`,
    );
    tab?.focus();
  }

  protected async reset(): Promise<void> {
    await confirmReset(this.ask, this.store);
    // the question closed this dialog: show it again
    this.dialogs.show('settings');
  }
}
