import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { TEXT_PATH_LIMITS, TextPathDto } from '../../core/fonts/fonts.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { familyOf, filterFamilies, regularStyle, resolveFont } from './text-path';
import { TextPathService } from './text-path.service';
import { TOOLS_TEXTS } from './tools-texts';

/** Wait this long after typing before the outlines are asked for. */
export const PREVIEW_DELAY = 150;

/**
 * "Add › Text to Path…" (design 013 E13): text (one line), font family (search + list), style,
 * size, letter spacing and a preview of the REAL result (Rust outlines, debounced, stale answers
 * dropped). "Add" inserts the path centred; errors via `describeFsError`.
 */
@Component({
  selector: 'app-text-path-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.title" width="40rem" (closed)="dialogs.close()">
      <label class="field">
        <span
          >{{ t.text }} <span class="count">{{ t.count(chars(), max) }}</span></span
        >
        <input
          class="input"
          type="text"
          data-autofocus
          data-testid="text-path-text"
          spellcheck="false"
          [attr.maxlength]="max"
          [placeholder]="t.textPlaceholder"
          [value]="text()"
          (input)="onText($event)"
          (keydown.enter)="add()"
        />
      </label>
      <div class="row">
        <div class="field family">
          <label for="tp-family-search">{{ t.family }}</label>
          <input
            id="tp-family-search"
            class="input"
            type="search"
            spellcheck="false"
            autocomplete="off"
            data-testid="text-path-family-search"
            [attr.aria-label]="t.familySearch"
            [placeholder]="t.familySearch"
            [value]="familyQuery()"
            (input)="familyQuery.set(value($event))"
          />
          <select
            class="input list"
            size="7"
            data-testid="text-path-family"
            [attr.aria-label]="t.family"
            (change)="onFamily($event)"
          >
            @for (f of families(); track f.family) {
              <option [value]="f.family" [selected]="f.family === family()?.family">
                {{ f.family }}
              </option>
            }
          </select>
          @if (service.fonts() === null) {
            <span class="note">{{ t.loading }}</span>
          } @else if (!service.fonts()!.length) {
            <span class="note">{{ t.noFonts }}</span>
          }
        </div>
        <div class="col">
          <label class="field">
            <span>{{ t.style }}</span>
            <select class="input" data-testid="text-path-style" (change)="onStyle($event)">
              @for (s of family()?.styles ?? []; track s.id) {
                <option [value]="s.id" [selected]="s.id === fontId()">{{ s.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>{{ t.size }}</span>
            <input
              class="input num"
              type="number"
              data-testid="text-path-size"
              [min]="limits.minSize"
              [max]="limits.maxSize"
              [value]="size()"
              (change)="onNumber($event, limits.minSize, limits.maxSize, size.set)"
            />
          </label>
          <label class="field">
            <span>{{ t.letterSpacing }}</span>
            <input
              class="input num"
              type="number"
              step="1"
              [min]="-limits.maxLetterSpacing"
              [max]="limits.maxLetterSpacing"
              [value]="letterSpacing()"
              (change)="
                onNumber(
                  $event,
                  -limits.maxLetterSpacing,
                  limits.maxLetterSpacing,
                  letterSpacing.set
                )
              "
            />
          </label>
        </div>
      </div>
      <div class="preview" [attr.aria-label]="t.preview" role="img" data-testid="text-path-preview">
        @if (result(); as r) {
          @if (viewBox(); as vb) {
            <svg [attr.viewBox]="vb" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <path [attr.d]="r.d" />
            </svg>
          }
        } @else if (!error()) {
          <span class="note">{{ t.previewEmpty }}</span>
        }
      </div>
      <p class="error" role="alert" data-testid="text-path-error">{{ error() }}</p>
      <div class="actions">
        <button type="button" class="btn" (click)="dialogs.close()">{{ t.cancel }}</button>
        <button
          type="button"
          class="btn primary"
          data-testid="text-path-add"
          [disabled]="!canAdd()"
          (click)="add()"
        >
          {{ t.add }}
        </button>
      </div>
    </app-modal>
  `,
  styleUrl: './text-path-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextPathDialog {
  protected readonly dialogs = inject(DialogService);
  protected readonly service = inject(TextPathService);
  protected readonly t = TOOLS_TEXTS.textPath;
  protected readonly limits = TEXT_PATH_LIMITS;
  protected readonly max = TEXT_PATH_LIMITS.maxChars;
  private readonly last = this.service.last();
  protected readonly text = signal(this.last.text);
  protected readonly fontId = signal<string | null>(this.last.fontId);
  protected readonly size = signal(this.last.size);
  protected readonly letterSpacing = signal(this.last.letterSpacing);
  protected readonly familyQuery = signal('');
  protected readonly result = signal<TextPathDto | null>(null);
  protected readonly error = signal('');
  /** An answer for the current inputs is still to come (no "Add" of an older result). */
  private readonly pending = signal(false);
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly chars = computed(() => [...this.text()].length);
  protected readonly family = computed(() => {
    const id = this.fontId();
    return id ? familyOf(this.service.fonts() ?? [], id) : null;
  });
  protected readonly families = computed(() => {
    const all = filterFamilies(this.service.fonts() ?? [], this.familyQuery());
    const cur = this.family();
    // the chosen family stays visible while searching
    return cur && !all.includes(cur) ? [cur, ...all] : all;
  });
  protected readonly canAdd = computed(
    () => !!this.result()?.bbox && !this.error() && !this.pending() && !!this.text().trim(),
  );
  protected readonly viewBox = computed(() => {
    const b = this.result()?.bbox;
    if (!b) return null;
    const pad = Math.max(b.width, b.height) * 0.05 + 1;
    return `${b.x - pad} ${b.y - pad} ${b.width + 2 * pad} ${b.height + 2 * pad}`;
  });

  constructor() {
    void this.service.loadFonts().then((fonts) => {
      const known = this.fontId() && familyOf(fonts, this.fontId()!);
      if (!known) this.fontId.set(resolveFont(fonts)?.id ?? null);
    });
    // the preview follows every input (debounced; only the newest answer counts)
    effect(() => {
      const text = this.text();
      const id = this.fontId();
      const size = this.size();
      const ls = this.letterSpacing();
      untracked(() => this.schedule(text, id, size, ls));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  private schedule(text: string, id: string | null, size: number, ls: number): void {
    clearTimeout(this.timer);
    const seq = ++this.seq;
    if (!text.trim() || !id) {
      this.pending.set(false);
      this.result.set(null);
      this.error.set('');
      return;
    }
    this.pending.set(true);
    this.timer = setTimeout(async () => {
      try {
        const r = await this.service.textToPath(text, id, size, ls);
        if (seq !== this.seq) return;
        this.result.set(r);
        this.error.set('');
      } catch (e) {
        if (seq !== this.seq) return;
        this.result.set(null);
        this.error.set(describeFsError(toFsError(e)));
      }
      this.pending.set(false);
    }, PREVIEW_DELAY);
  }

  protected value(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  protected onText(e: Event): void {
    this.text.set(this.value(e));
  }

  protected onFamily(e: Event): void {
    const fam = (this.service.fonts() ?? []).find(
      (f) => f.family === (e.target as HTMLSelectElement).value,
    );
    const cur = this.family()?.styles.find((s) => s.id === this.fontId());
    // keep the style when the new family has it
    const next = fam?.styles.find((s) => s.name === cur?.name) ?? (fam && regularStyle(fam.styles));
    if (next) this.fontId.set(next.id);
  }

  protected onStyle(e: Event): void {
    this.fontId.set((e.target as HTMLSelectElement).value);
  }

  protected onNumber(e: Event, min: number, max: number, set: (v: number) => void): void {
    const el = e.target as HTMLInputElement;
    const v = Number(el.value);
    if (el.value.trim() === '' || !Number.isFinite(v)) return;
    const c = Math.min(max, Math.max(min, v));
    set(c);
    el.value = String(c);
  }

  protected async add(): Promise<void> {
    const r = this.result();
    if (!r || !this.canAdd()) return;
    this.service.last.set({
      text: this.text(),
      fontId: this.fontId(),
      size: this.size(),
      letterSpacing: this.letterSpacing(),
    });
    this.dialogs.close();
    await this.service.insert(r, {});
  }
}
