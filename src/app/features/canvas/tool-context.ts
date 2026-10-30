import { DestroyRef, Injectable } from '@angular/core';

/** How an option of the context bar is edited (prompt 067). */
export type ToolOptionKind = 'number' | 'color' | 'toggle' | 'choice';

/**
 * One option of the active tool in the context bar (prompt 067): read and written through
 * signals of the tool's store, so the bar, the keyboard and the AI (`tool.option { key, value }`)
 * change the same state. `set` returns `false` for a value it does not take.
 */
export interface ToolOption {
  key: string;
  label: string;
  kind: ToolOptionKind;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** `choice`: the values as buttons (a glyph or the label). */
  choices?: readonly { value: string; label: string; glyph?: string }[];
  value(): string | number | boolean | null;
  set(value: unknown): boolean;
  /** `data-testid` of the editor (kept from the bars it replaces). */
  testId?: string;
}

/** What the context bar shows for a tool. */
export interface ToolContext {
  options: ToolOption[];
  /** Short modifier tip on the right (`⇧ 45° · ⌥ remove`). */
  tip?: string;
  /** A warning next to the options (e.g. an open live fill). */
  note?: { text: string; testId?: string } | null;
  /** `data-testid` of the options group (kept from the bars it replaces). */
  testId?: string;
}

/** A feature's contexts: for an action id of a tool (`pen.tool`, `sketch.line` …) or `null`. */
export type ToolContextProvider = (actionId: string) => ToolContext | null;

/** The checked value as a number within the option's range; `null` = not taken. */
export function optionNumber(o: ToolOption, v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  if (!Number.isFinite(n)) return null;
  if ((o.min !== undefined && n < o.min) || (o.max !== undefined && n > o.max)) return null;
  return n;
}

/**
 * The contexts of the tools of this window (prompt 067): features register a provider; the context
 * bar asks for the active tool's. The first provider that knows the tool wins.
 */
@Injectable({ providedIn: 'root' })
export class ToolContexts {
  private readonly providers: ToolContextProvider[] = [];

  register(p: ToolContextProvider, destroyRef?: DestroyRef): void {
    this.providers.push(p);
    destroyRef?.onDestroy(() => {
      const i = this.providers.indexOf(p);
      if (i >= 0) this.providers.splice(i, 1);
    });
  }

  for(actionId: string): ToolContext | null {
    for (const p of this.providers) {
      const c = p(actionId);
      if (c) return c;
    }
    return null;
  }
}
