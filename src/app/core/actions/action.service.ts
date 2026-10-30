import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { language } from '../i18n/i18n';
import { KeymapApi } from '../menu/menu-api';
import { KeymapOverrides } from '../menu/menu.models';
import { ACTION_LABELS_DE } from './action-catalog.de';
import { checkArgs, ArgsSpec } from './action-args';
import { ActionContext, actionDef, ActionDef, ActionGroup, ACTIONS } from './action-catalog';
import { buildKeymap, Keymap } from './keymap';
import { OS } from './platform';
import { formatChord } from './shortcut';

/** What a feature offers for an action. */
export interface ActionHandler {
  /**
   * `args` were checked against the action's `args` spec. Work that goes on (a dialog, the
   * backend) returns its promise, so the AI waits for the end (design 018 E11).
   */
  run(args?: unknown): unknown;
  /**
   * May read signals (menus follow). Default: enabled. `run` passes the arguments, so a target
   * given by the AI counts (design 014 E14); menus and keys ask without.
   */
  enabled?: (args?: unknown) => boolean;
  /** For toggles / radio items in menus. */
  checked?: () => boolean | undefined;
  /** A label that changes ("Undo Change Fill", legacy §12). */
  label?: () => string;
  /** Hold actions: the key was released (or the window lost the focus). */
  release?: () => void;
}

/** One action as the AI (MCP, prompt 018), the palette or a test sees it. */
export interface ActionInfo {
  id: string;
  label: string;
  group: ActionGroup;
  context: ActionContext;
  enabled: boolean;
  checked?: boolean;
  shortcut: string;
  args?: ArgsSpec;
}

/**
 * The actions of the window (design 005 E3; taken over from editlicious `action.service.ts`,
 * there from comic-commander design 008): features register handlers (removed with their
 * `DestroyRef`; the last registration wins, the one before comes back when it goes); keyboard,
 * menus, palette and – later – the AI run them by id, with serialisable arguments.
 */
@Injectable({ providedIn: 'root' })
export class ActionService {
  readonly os = inject(OS);
  private readonly keymapApi = inject(KeymapApi, { optional: true });
  private readonly stacks = new Map<string, ActionHandler[]>();
  /** Bumped on every (un)registration – menus and palette recompute. */
  private readonly version = signal(0);
  readonly keymap = signal<Keymap>(buildKeymap(this.os));
  /** The `bindings` of `keymap.json` the keymap was built with. */
  readonly overrides = signal<Readonly<Record<string, string[]>>>({});
  private listening = false;

  /**
   * Loads `keymap.json` (design 005 E14) and follows changes made in any window (`keymap-changed`,
   * design 085 E3); problems go to the console only.
   */
  async loadOverrides(): Promise<void> {
    if (this.keymapApi && !this.listening) {
      this.listening = true;
      void this.keymapApi.onChanged((o) => this.applyOverrides(o)).catch(() => undefined);
    }
    try {
      const o = await this.keymapApi?.loadOverrides();
      if (!o) return;
      if (o.warning) console.warn('keymap.json', o.warning.code, o.warning.path);
      this.applyOverrides(o);
    } catch {
      // no backend (browser) or unreadable: the defaults stay
    }
  }

  /** Rebuilds the keymap from `keymap.json` (menus, tooltips and keys follow at once). */
  applyOverrides(o: Pick<KeymapOverrides, 'bindings'>): void {
    const k = buildKeymap(this.os, o.bindings);
    k.notes.forEach((n) => console.warn(n));
    this.overrides.set(o.bindings);
    this.keymap.set(k);
  }

  register(id: string, handler: ActionHandler, destroyRef?: DestroyRef): () => void {
    if (!actionDef(id)) throw new Error(`unknown action ${id}`);
    const stack = this.stacks.get(id) ?? [];
    stack.push(handler);
    this.stacks.set(id, stack);
    this.version.update((v) => v + 1);
    let done = false;
    const off = () => {
      if (done) return;
      done = true;
      const s = this.stacks.get(id);
      const i = s?.lastIndexOf(handler) ?? -1;
      if (s && i >= 0) s.splice(i, 1);
      this.version.update((v) => v + 1);
    };
    destroyRef?.onDestroy(off);
    return off;
  }

  /** Several at once (one `DestroyRef`). */
  registerAll(handlers: Record<string, ActionHandler>, destroyRef?: DestroyRef): () => void {
    const offs = Object.entries(handlers).map(([id, h]) => this.register(id, h, destroyRef));
    return () => offs.forEach((f) => f());
  }

  private handler(id: string): ActionHandler | undefined {
    this.version();
    const s = this.stacks.get(id);
    return s?.[s.length - 1];
  }

  /** A feature offers the action now. */
  available(id: string): boolean {
    return this.handler(id) !== undefined;
  }

  enabled(id: string): boolean {
    const h = this.handler(id);
    return !!h && (h.enabled?.() ?? true);
  }

  checked(id: string): boolean | undefined {
    return this.handler(id)?.checked?.();
  }

  /**
   * Runs the action if it is there, enabled and `args` fit its spec; `true` = it ran. Arguments
   * must be plain JSON (they may come from the AI).
   */
  run(id: string, args?: unknown): boolean {
    const started = this.start(id, args);
    if (started) void started.catch((e: unknown) => console.error(id, e));
    return started !== null;
  }

  /**
   * Like {@link run}, but waits until the action is done (its handler's promise, design 018
   * E11). `false` = it did not run; a failure of the action rejects.
   */
  async runAsync(id: string, args?: unknown): Promise<boolean> {
    const started = this.start(id, args);
    if (!started) return false;
    await started;
    return true;
  }

  private start(id: string, args?: unknown): Promise<unknown> | null {
    const def = actionDef(id);
    const h = this.handler(id);
    if (!def || !h || !checkArgs(def.args, args) || !(h.enabled?.(args) ?? true)) return null;
    return Promise.resolve(h.run(args));
  }

  /** Hold actions: the key went up. */
  release(id: string): void {
    this.handler(id)?.release?.();
  }

  def(id: string): ActionDef | undefined {
    return actionDef(id);
  }

  /** The label now, in the UI language (reactive): the handler's own (Undo …) or the catalogue's. */
  label(id: string): string {
    const own = this.handler(id)?.label?.();
    if (own !== undefined) return own;
    const en = actionDef(id)?.label ?? id;
    return language() === 'de' ? (ACTION_LABELS_DE[id] ?? en) : en;
  }

  /** The chords of an action (canonical). */
  chords(id: string): string[] {
    return this.keymap().chords.get(id) ?? [];
  }

  /** The first shortcut as the OS shows it, `''` = none. */
  shortcut(id: string): string {
    const c = this.chords(id)[0];
    return c ? formatChord(c, this.os) : '';
  }

  /** `label (shortcut)` for tooltips. */
  tooltip(id: string): string {
    const s = this.shortcut(id);
    return s ? `${this.label(id)} (${s})` : this.label(id);
  }

  /** Registered actions (for the palette). */
  readonly registered = computed(() => {
    this.version();
    return [...this.stacks.entries()].filter(([, s]) => s.length > 0).map(([id]) => id);
  });

  /** Every action with its state – what the AI gets to see (design 005 E3). */
  describe(): ActionInfo[] {
    return ACTIONS.map((d) => {
      const checked = this.checked(d.id);
      return {
        id: d.id,
        label: this.label(d.id),
        group: d.group,
        context: d.context,
        enabled: this.enabled(d.id),
        ...(checked === undefined ? {} : { checked }),
        shortcut: this.shortcut(d.id),
        ...(d.args ? { args: d.args } : {}),
      };
    });
  }
}
