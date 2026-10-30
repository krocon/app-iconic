import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, Injector, untracked } from '@angular/core';
import { PngSize } from '../../core/export/export.models';
import { setLanguage, systemLanguage } from '../../core/i18n/i18n';
import { SettingsApi } from '../../core/settings/settings-api';
import { Settings, SettingsPatch } from '../../core/settings/settings.models';
import { applyTheme } from '../../core/settings/theme';
import { CanvasOptions, CanvasViewStore } from '../canvas/canvas-view.store';
import { logUndoGrouping } from '../document/undo/undo-log';
import { ConstraintFollower } from '../constraints/constraint-follower';
import { ExportChoice } from '../export/export-options';
import { ExportService } from '../export/export.service';
import { FilesService } from '../files/files.service';
import { LayoutStore, PanelId } from '../shell/layout.store';
import { FreehandStore } from '../tools/freehand.store';
import { SETTINGS_TEXTS } from './settings-texts';
import { SettingsStore } from './settings.store';

const PANELS: readonly PanelId[] = ['commands', 'hierarchy', 'properties'];
/** Canvas options that are settings 1:1 (appearance and zoom have their own rules). */
const CANVAS_KEYS = [
  'rulers',
  'guides',
  'background',
  'effects',
  'crossCursor',
  'handles',
  'snapToGrid',
  'magicSnap',
  'smartGuides',
  'guideTemplate',
  'guideDivisions',
  'gridSize',
  'gridOrigin',
  'selectionMode',
  'mask',
] as const satisfies readonly (keyof CanvasOptions & keyof Settings['canvas'])[];

function systemAppearance(): 'light' | 'dark' {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Binds the settings to the stores of the window (design 015 E6): settings → stores when they
 * change (start, another window, the dialog, `settings.set`), stores → settings when the user
 * changes a view option, a panel or the export choice. Both directions compare first, so a value
 * never echoes. Also applies theme, language and the undo log flag. `start()` once after load.
 */
@Injectable({ providedIn: 'root' })
export class SettingsSync {
  private readonly store = inject(SettingsStore);
  private readonly layout = inject(LayoutStore);
  private readonly view = inject(CanvasViewStore);
  private readonly exporter = inject(ExportService);
  private readonly freehand = inject(FreehandStore);
  private readonly files = inject(FilesService);
  private readonly constraints = inject(ConstraintFollower);
  private readonly api = inject(SettingsApi, { optional: true });
  private readonly doc = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private started = false;
  /** The settings last applied to the stores: only what changed since is applied again. */
  private applied: Settings | null = null;

  start(): void {
    if (this.started) return;
    this.started = true;
    const s = this.store.settings();
    this.view.setStartZoom(s.canvas.zoom);
    // the stores take the loaded settings before any effect compares
    this.toStores(s);
    this.showWarning();
    const opts = { injector: this.injector };
    effect(() => {
      const next = this.store.settings();
      untracked(() => this.toStores(next));
    }, opts);
    effect(() => {
      const patch = this.fromStores();
      untracked(() => {
        if (patch) this.store.update(patch);
      });
    }, opts);
    effect(() => {
      const theme = this.store.settings().theme;
      untracked(() => {
        applyTheme(this.doc.documentElement, theme);
        void this.api?.setWindowTheme(theme).catch(() => undefined);
      });
    }, opts);
    effect(() => {
      const lang = this.store.settings().language;
      untracked(() => setLanguage(lang === 'system' ? systemLanguage() : lang));
    }, opts);
    effect(() => logUndoGrouping.set(this.store.settings().debug.logUndoGrouping), opts);
    // constraints are solved again after free changes (prompt 065)
    effect(() => this.constraints.autoSolve.set(this.store.settings().constraints.autoSolve), opts);
    // a change waiting in the bundle is sent when the window goes or loses the focus
    const flush = () => void this.store.flush();
    const win = this.doc.defaultView;
    win?.addEventListener('pagehide', flush);
    win?.addEventListener('blur', flush);
  }

  /**
   * Settings → stores: only the values that changed since the last time (a store change that is
   * not in the settings yet must not be undone by another setting), and only where they differ.
   */
  private toStores(s: Settings): void {
    const before = this.applied;
    this.applied = s;
    const changed = (pick: (x: Settings) => unknown) => !before || !same(pick(before), pick(s));
    for (const p of PANELS) {
      if (changed((x) => x.panels[p].visible) && this.layout.panels()[p] !== s.panels[p].visible) {
        this.layout.panels.update((v) => ({ ...v, [p]: s.panels[p].visible }));
      }
      if (changed((x) => x.panels[p].width)) this.layout.setWidth(p, s.panels[p].width);
    }
    const o = this.view.options();
    const canvas: Partial<CanvasOptions> = {};
    for (const k of CANVAS_KEYS) {
      if (changed((x) => x.canvas[k]) && o[k] !== s.canvas[k]) {
        (canvas as Record<string, unknown>)[k] = s.canvas[k];
      }
    }
    const appearance = s.canvas.appearance === 'system' ? null : s.canvas.appearance;
    if (changed((x) => x.canvas.appearance) && appearance && o.appearance !== appearance) {
      canvas.appearance = appearance;
    }
    if (Object.keys(canvas).length) this.view.options.set({ ...o, ...canvas });
    if (changed((x) => x.export)) {
      const e = s.export;
      const c = this.exporter.choice();
      const choice: Partial<ExportChoice> = {
        format: e.format,
        appearances: [...e.appearances],
        sizes: e.sizes as PngSize[],
        mask: e.mask,
        effects: e.effects,
        targetDir: e.targetDir,
      };
      if (!same({ ...c, ...choice }, c)) this.exporter.update(choice);
    }
    const f = s.freehand;
    if (changed((x) => x.freehand.epsilon)) this.freehand.epsilon.set(f.epsilon);
    if (changed((x) => x.freehand.strokeWidth)) this.freehand.strokeWidth.set(f.strokeWidth);
    if (changed((x) => x.freehand.closed)) this.freehand.closed.set(f.closed);
  }

  /** Stores → a patch of what differs from the settings (`null` = nothing). Reads the stores. */
  private fromStores(): SettingsPatch | null {
    const visible = this.layout.panels();
    const widths = this.layout.widths();
    const o = this.view.options();
    const zoom = this.view.chosenZoom();
    const c = this.exporter.choice();
    const f = {
      epsilon: this.freehand.epsilon(),
      strokeWidth: this.freehand.strokeWidth(),
      closed: this.freehand.closed(),
    };
    return untracked(() => {
      const s = this.store.settings();
      const patch: SettingsPatch = {};
      const panels: NonNullable<SettingsPatch['panels']> = {};
      for (const p of PANELS) {
        if (visible[p] !== s.panels[p].visible || widths[p] !== s.panels[p].width) {
          panels[p] = { visible: visible[p], width: widths[p] };
        }
      }
      if (Object.keys(panels).length) patch.panels = panels;
      const canvas: Record<string, unknown> = {};
      for (const k of CANVAS_KEYS) if (o[k] !== s.canvas[k]) canvas[k] = o[k];
      // the preview appearance becomes a choice once it differs from what the setting shows
      const shown = s.canvas.appearance === 'system' ? systemAppearance() : s.canvas.appearance;
      // tinted is not a start appearance (prompt 077 E2): it is not saved
      if (o.appearance !== shown && o.appearance !== 'tinted') canvas['appearance'] = o.appearance;
      if (zoom !== s.canvas.zoom) canvas['zoom'] = zoom;
      if (Object.keys(canvas).length) patch.canvas = canvas;
      const e = s.export;
      const exp = {
        format: c.format,
        appearances: c.appearances,
        sizes: c.sizes,
        mask: c.mask,
        effects: c.effects,
        targetDir: c.targetDir,
      };
      if (!same(exp, e)) patch.export = exp;
      if (!same(f, s.freehand)) patch.freehand = f;
      return Object.keys(patch).length ? patch : null;
    });
  }

  private showWarning(): void {
    const w = this.store.warning();
    if (!w) return;
    const t = SETTINGS_TEXTS;
    this.files.notice.set(w.code === 'broken' ? t.broken(w.path) : t.unreadable);
  }
}
