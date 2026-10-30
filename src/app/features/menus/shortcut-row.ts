import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { KeyboardDispatcher } from '../../core/actions/keyboard-dispatcher';
import { Reservation } from '../../core/actions/reserved-shortcuts';
import { formatChord } from '../../core/actions/shortcut';
import { KeymapEditor } from './keymap-editor';
import { MENUS_TEXTS } from './menus-texts';
import { ShortcutRowData } from './shortcuts-model';

/** A recorded chord another action holds: what to do (design 085 E5). */
interface Pending {
  chord: string;
  old: string | null;
  conflicts: string[];
}

/**
 * One action in the shortcut editor (design 085 E7): its shortcuts as buttons (click = record a
 * new one in its place, × = remove), + = record another, Reset when it differs. Recording goes
 * through the `KeyboardDispatcher` (design 085 E4) – no action runs meanwhile. A conflict shows
 * Swap / Replace / Cancel; a reserved shortcut is refused or noted with its source.
 */
@Component({
  selector: 'app-shortcut-row',
  template: `
    <span class="label">
      {{ row().label }}
      @if (row().changed) {
        <span class="changed">{{ t.changed }}</span>
      }
    </span>
    <span class="keys">
      @for (c of row().chords; track $index; let i = $index) {
        @if (row().editable) {
          <span class="chip">
            <button
              type="button"
              class="key"
              [attr.aria-label]="t.changeShortcut(row().label, row().keys[i])"
              (click)="start(c)"
            >
              <kbd>{{ row().keys[i] }}</kbd>
            </button>
            <button
              type="button"
              class="x"
              [attr.aria-label]="t.removeShortcut(row().label, row().keys[i])"
              [title]="t.removeShortcut(row().label, row().keys[i])"
              (click)="remove(c)"
            >
              ×
            </button>
          </span>
        } @else {
          <kbd>{{ row().keys[i] }}</kbd>
        }
      }
      @if (recording()) {
        <button
          type="button"
          class="recorder"
          data-recorder
          [attr.aria-label]="t.recordFor(row().label)"
          (keydown)="dispatcher.capture($event)"
          (blur)="stop()"
        >
          {{ t.pressShortcut }}
        </button>
      }
      @if (row().editable) {
        <button
          type="button"
          class="add"
          [attr.aria-label]="t.addShortcut(row().label)"
          [title]="t.addShortcut(row().label)"
          (click)="start(null)"
        >
          +
        </button>
        @if (row().changed) {
          <button
            type="button"
            class="btn quiet reset"
            [attr.aria-label]="t.resetShortcut(row().label)"
            (click)="reset()"
          >
            {{ t.reset }}
          </button>
        }
      } @else if (row().fixed) {
        <span class="fixed" [title]="t.fixedHint">{{ t.fixed }}</span>
      }
    </span>
    @if (pending(); as p) {
      <div class="note" role="alert">
        <span>{{ conflictText(p) }}</span>
        @if (canSwap(p)) {
          <button type="button" class="btn swap" (click)="resolve('swap')">{{ t.swap }}</button>
        }
        <button type="button" class="btn primary replace" (click)="resolve('replace')">
          {{ t.replace }}
        </button>
        <button type="button" class="btn cancel" (click)="pending.set(null)">
          {{ t.cancel }}
        </button>
      </div>
    }
    @if (message(); as m) {
      <div class="note" [class.warn]="!m.blocked" role="status">{{ m.text }}</div>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px var(--space-2);
      align-items: center;
      padding: 3px var(--space-2);
      border-bottom: 1px solid var(--color-border);
    }
    .changed,
    .fixed {
      margin-left: var(--space-1);
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .keys {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      gap: var(--space-1);
    }
    .chip {
      display: inline-flex;
      align-items: center;
    }
    .key,
    .x,
    .add {
      padding: 0 2px;
      font: inherit;
      color: var(--color-text);
      background: transparent;
      border: 0;
      border-radius: 4px;
      cursor: pointer;
    }
    .x,
    .add {
      min-width: 1.4em;
      color: var(--color-text-muted);
    }
    .key:hover kbd,
    .x:hover,
    .add:hover {
      background: var(--color-hover);
    }
    .recorder {
      padding: 1px var(--space-2);
      font: inherit;
      font-size: var(--font-size-small);
      color: var(--color-text);
      background: var(--color-selection);
      border: 1px dashed var(--color-accent);
      border-radius: 4px;
    }
    .reset {
      height: auto;
      padding: 0 var(--space-1);
      font-size: var(--font-size-small);
    }
    .note {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
      font-size: var(--font-size-small);
      color: var(--color-error);

      &.warn {
        color: var(--color-warning);
      }
      & span {
        flex: 1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShortcutRow {
  readonly row = input.required<ShortcutRowData>();
  protected readonly dispatcher = inject(KeyboardDispatcher);
  private readonly editor = inject(KeymapEditor);
  private readonly actions = inject(ActionService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  protected readonly t = MENUS_TEXTS;
  protected readonly pending = signal<Pending | null>(null);
  protected readonly message = signal<{ text: string; blocked: boolean } | null>(null);
  private stopRecording: (() => void) | null = null;

  protected readonly recording = computed(() => this.editor.target()?.id === this.row().id);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected start(old: string | null): void {
    this.pending.set(null);
    this.message.set(null);
    this.editor.target.set({ id: this.row().id, old });
    this.stopRecording?.();
    this.stopRecording = this.dispatcher.record((chord) => this.recorded(chord, old));
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>('[data-recorder]')?.focus(),
      { injector: this.injector },
    );
  }

  /** Ends recording (Esc, blur, done); the focus stays in the row. */
  protected stop(): void {
    this.stopRecording?.();
    this.stopRecording = null;
    if (this.editor.target()?.id === this.row().id) this.editor.target.set(null);
  }

  private key(chord: string): string {
    return formatChord(chord, this.editor.os);
  }

  private reservationText(chord: string, r: Reservation, blocked: boolean): string {
    const t = this.t;
    return (blocked ? t.blocked : t.warned)(
      this.key(chord),
      t.reserved[r.reason],
      t.source[r.source],
    );
  }

  private recorded(chord: string | null, old: string | null): void {
    const recorder = this.host.nativeElement.querySelector<HTMLElement>('[data-recorder]');
    const hadFocus = recorder !== null && recorder === document.activeElement;
    this.stop();
    if (chord !== null) this.apply({ chord, old, conflicts: [] });
    // the focus goes back into the row (a new button of the conflict, or the + button)
    if (hadFocus) {
      afterNextRender(() => this.focusAfter(), { injector: this.injector });
    }
  }

  private focusAfter(): void {
    const el = this.host.nativeElement;
    const target =
      el.querySelector<HTMLElement>('.note .replace') ??
      el.querySelector<HTMLElement>('.add') ??
      el.querySelector<HTMLElement>('button');
    target?.focus();
  }

  private apply(p: Pending, resolution?: 'replace' | 'swap'): void {
    const r = this.editor.assign({ id: this.row().id, chord: p.chord, old: p.old, resolution });
    if (r.ok) {
      this.pending.set(null);
      this.message.set(
        r.warning
          ? { text: this.reservationText(p.chord, r.warning, false), blocked: false }
          : null,
      );
      return;
    }
    if (r.reason === 'conflict') {
      this.pending.set({ ...p, conflicts: r.conflicts ?? [] });
    } else if (r.reason === 'blocked' && r.reservation) {
      this.pending.set(null);
      this.message.set({ text: this.reservationText(p.chord, r.reservation, true), blocked: true });
    } else if (r.reason === 'swap') {
      this.message.set({ text: this.t.swapFailed, blocked: true });
    }
  }

  protected canSwap(p: Pending): boolean {
    return p.conflicts.length === 1 && p.old !== null;
  }

  protected conflictText(p: Pending): string {
    const names = p.conflicts.map((id) => `„${this.actions.label(id)}“`).join(', ');
    return this.t.conflict(this.key(p.chord), names);
  }

  protected resolve(how: 'replace' | 'swap'): void {
    const p = this.pending();
    if (!p) return;
    this.apply(p, how);
    afterNextRender(() => this.focusAfter(), { injector: this.injector });
  }

  protected remove(chord: string): void {
    this.message.set(null);
    void this.editor.remove(this.row().id, chord);
    afterNextRender(() => this.focusAfter(), { injector: this.injector });
  }

  protected reset(): void {
    this.pending.set(null);
    this.message.set(null);
    void this.editor.reset(this.row().id);
    afterNextRender(() => this.focusAfter(), { injector: this.injector });
  }
}
