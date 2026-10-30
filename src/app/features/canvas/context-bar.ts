import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { ClipEditStore } from '../clip/clip-edit.store';
import { CLIP_TEXTS } from '../clip/clip-texts';
import { activeToolId } from '../commands/add-layout';
import { COMMAND_ICONS } from '../commands/command-icons';
import { FilesService } from '../files/files.service';
import { CANVAS_TEXTS } from './canvas-texts';
import { CanvasTools } from './canvas-tools';
import { ToolContext, ToolContexts, ToolOption } from './tool-context';

/** The selection tools have no bar (prompt 061). */
const SELECTION = new Set(['tool.select', 'tool.direct']);

/** `#rrggbb` for a colour input (`none` and short hex → a full hex). */
export function colorInputValue(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase() : '#000000';
}

/**
 * The context bar (prompt 067): one bar at the top of the canvas for every active tool – icon and
 * name, the tool's options (from `ToolContexts`), a warning, a short modifier tip and "Done" (Esc).
 * Replaces the freehand options of the toolbar, the floating bars of Constraints and Fill and the
 * clip path banner. Its actions: `tool.option { key, value }` (the AI's way), `tool.done`,
 * `tool.focusOptions` (F6: the keyboard into the bar; Esc goes back to the canvas).
 */
@Component({
  selector: 'app-context-bar',
  template: `
    @if (bar(); as b) {
      <div
        class="context-bar"
        role="toolbar"
        tabindex="-1"
        data-testid="context-bar"
        [attr.aria-label]="t.bar + ': ' + b.name"
        (pointerdown)="$event.stopPropagation()"
        (keydown)="key($event)"
      >
        <span class="name">
          @if (b.icon) {
            <svg viewBox="0 0 16 16" aria-hidden="true"><path [attr.d]="b.icon" /></svg>
          }
          <strong data-testid="context-name">{{ b.name }}</strong>
        </span>
        <span class="options" role="group" [attr.data-testid]="b.ctx.testId ?? null">
          @if (b.text) {
            <span class="text">{{ b.text }}</span>
          }
          @for (o of b.ctx.options; track o.key) {
            @switch (o.kind) {
              @case ('number') {
                <label class="opt">
                  {{ o.label }}
                  <input
                    class="input num"
                    type="number"
                    [attr.data-testid]="o.testId ?? null"
                    [attr.data-option]="o.key"
                    [min]="o.min ?? null"
                    [max]="o.max ?? null"
                    [step]="o.step ?? 1"
                    [value]="o.value()"
                    (change)="setFrom(o, $event)"
                  />
                </label>
              }
              @case ('color') {
                <label class="opt">
                  {{ o.label }}
                  <input
                    class="swatch"
                    type="color"
                    [attr.data-testid]="o.testId ?? null"
                    [attr.data-option]="o.key"
                    [value]="hex(o.value())"
                    (input)="setFrom(o, $event)"
                  />
                  @if (o.key !== 'color') {
                    <input
                      class="input hex"
                      type="text"
                      spellcheck="false"
                      [attr.aria-label]="o.label"
                      [attr.data-testid]="o.testId ? o.testId + '-text' : null"
                      [value]="o.value()"
                      (change)="setFrom(o, $event)"
                    />
                  }
                </label>
              }
              @case ('toggle') {
                <label class="opt">
                  <input
                    type="checkbox"
                    [attr.data-testid]="o.testId ?? null"
                    [attr.data-option]="o.key"
                    [checked]="o.value()"
                    (change)="setChecked(o, $event)"
                  />
                  {{ o.label }}
                </label>
              }
              @case ('choice') {
                <span class="choices" role="radiogroup" [attr.aria-label]="o.label">
                  @for (c of o.choices ?? []; track c.value) {
                    <button
                      type="button"
                      class="choice"
                      role="radio"
                      [attr.data-type]="c.value"
                      [attr.aria-checked]="o.value() === c.value"
                      [attr.aria-pressed]="o.value() === c.value"
                      [attr.aria-label]="c.label"
                      [title]="c.label"
                      (click)="o.set(c.value)"
                    >
                      {{ c.glyph ?? c.label }}
                    </button>
                  }
                </span>
              }
            }
          }
          @if (b.ctx.note; as n) {
            <span class="note" [attr.data-testid]="n.testId ?? null">{{ n.text }}</span>
          }
        </span>
        <span class="spacer"></span>
        @if (b.ctx.tip) {
          <span class="tip">{{ b.ctx.tip }}</span>
        }
        <button
          type="button"
          class="btn quiet done"
          data-testid="context-done"
          [title]="t.doneHint"
          (click)="done()"
        >
          {{ t.done }}
        </button>
      </div>
    }
  `,
  styleUrl: './context-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextBar {
  private readonly actions = inject(ActionService);
  private readonly contexts = inject(ToolContexts);
  private readonly tools = inject(CanvasTools);
  private readonly clip = inject(ClipEditStore);
  private readonly files = inject(FilesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly t = CANVAS_TEXTS.context;

  /** The active tool's action id (not the selection tools). */
  private readonly toolId = computed(() => {
    const id = activeToolId((a) => this.actions.checked(a));
    return id && !SELECTION.has(id) ? id : null;
  });

  private readonly clipId = computed(() => {
    const el = this.clip.scope(this.files.store()?.document());
    return el ? (el.getAttribute('id') ?? '') : null;
  });

  protected readonly bar = computed(
    (): { name: string; icon: string; ctx: ToolContext; text?: string } | null => {
      const id = this.toolId();
      if (id) {
        return {
          name: this.actions.label(id),
          icon: COMMAND_ICONS[id] ?? '',
          ctx: this.contexts.for(id) ?? { options: [] },
        };
      }
      const clip = this.clipId();
      if (clip !== null) {
        return {
          name: this.t.clip,
          icon: '',
          text: CLIP_TEXTS.editing(clip),
          ctx: { options: [], testId: 'clip-banner', tip: CLIP_TEXTS.editingHint },
        };
      }
      return null;
    },
  );

  constructor() {
    this.actions.registerAll(
      {
        'tool.option': {
          run: (a) => {
            const { key, value } = (a ?? {}) as { key?: unknown; value?: unknown };
            const o = this.bar()?.ctx.options.find((x) => x.key === key);
            return !!o && o.set(value);
          },
          enabled: () => (this.bar()?.ctx.options.length ?? 0) > 0,
        },
        'tool.done': { run: () => this.done(), enabled: () => this.bar() !== null },
        'tool.focusOptions': {
          run: () => {
            const first = this.host.querySelector<HTMLElement>(
              '.context-bar input, .context-bar button',
            );
            first?.focus();
            return !!first;
          },
          enabled: () => this.bar() !== null,
        },
      },
      inject(DestroyRef),
    );
  }

  protected hex(v: unknown): string {
    return colorInputValue(v);
  }

  protected setFrom(o: ToolOption, e: Event): void {
    const input = e.target as HTMLInputElement;
    const v = o.kind === 'number' ? Number(input.value) : input.value;
    if (!o.set(v)) input.value = String(o.value() ?? '');
  }

  protected setChecked(o: ToolOption, e: Event): void {
    o.set((e.target as HTMLInputElement).checked);
  }

  protected done(): void {
    if (this.toolId()) this.tools.stopAll();
    else this.clip.exit();
  }

  /** Esc in the bar: back to the canvas (the tool stays on). */
  protected key(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    this.host.closest('app-canvas-view')?.querySelector<HTMLElement>('.viewport')?.focus();
  }
}
