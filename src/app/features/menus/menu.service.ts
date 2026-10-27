import { computed, effect, inject, Injectable, Injector, signal, untracked } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { MenuApi } from '../../core/menu/menu-api';
import { DialogService } from '../../shared/dialog/dialog.service';
import { RecentFilesService } from '../files/recent-files.service';
import {
  appMenuSpec,
  buildMenuModel,
  menuChord,
  resolveMenu,
  ResolvedMenu,
  toSpec,
} from './menu-model';

/** Pause before the native menu is rebuilt after a change. */
const NATIVE_DEBOUNCE_MS = 150;

/**
 * The menus of the window (design 005 E5/E6; taken over from editlicious `menu.service.ts`): one
 * resolved model from the catalogue, the registered actions and the recent files. On macOS it
 * becomes the native menu bar (sent when a state changes; Rust shows the spec of the window in
 * front) and its clicks come back as actions; elsewhere the HTML menu bar draws it.
 */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private readonly actions = inject(ActionService);
  private readonly api = inject(MenuApi);
  private readonly recent = inject(RecentFilesService);
  private readonly dialogs = inject(DialogService);
  private readonly injector = inject(Injector);
  /** Bumped after every native click: the native menu toggles a check item itself. */
  private readonly clicks = signal(0);
  private started = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly menus = computed<ResolvedMenu[]>(() => {
    const os = this.actions.os;
    const model = buildMenuModel(os, { recent: this.recent.files().map((f) => f.name) });
    return resolveMenu(
      model,
      {
        label: (id) => this.actions.label(id),
        enabled: (id) => this.actions.enabled(id),
        checked: (id) => this.actions.checked(id),
        chord: (id) => menuChord(this.actions.chords(id)),
        anyChord: (id) => this.actions.chords(id)[0] ?? '',
      },
      os,
    );
  });

  /** The spec the native menu gets (also for tests and the browser hook). */
  readonly spec = computed(() => ({
    ...toSpec(this.menus()),
    app: appMenuSpec(
      (id) => this.actions.label(id),
      menuChord(this.actions.chords('app.settings')),
    ),
  }));

  /** A menu opens (HTML bar): "Open Recent" shows only files that still exist (legacy §4). */
  opening(): void {
    void this.recent.refresh();
  }

  /** Native menu (macOS) and its clicks; call once at start. */
  start(): void {
    if (this.started) return;
    this.started = true;
    void this.api
      .onAction((id) => {
        this.clicks.update((n) => n + 1);
        // a dialog owns the window – native shortcuts and clicks wait, quitting does not
        if (this.dialogs.open() !== null && id !== 'app.quit') return;
        this.actions.run(id);
      })
      .catch(() => undefined);
    if (this.actions.os !== 'mac') return;
    effect(
      () => {
        this.clicks();
        const spec = this.spec();
        untracked(() => {
          clearTimeout(this.timer);
          this.timer = setTimeout(
            () => void this.api.setAppMenu(spec).catch((e) => console.warn('menu', e)),
            NATIVE_DEBOUNCE_MS,
          );
        });
      },
      { injector: this.injector },
    );
  }
}
