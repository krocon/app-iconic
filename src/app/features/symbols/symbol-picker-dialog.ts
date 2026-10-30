import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { MINE } from './my-symbols-provider';
import { MySymbolsBar } from './my-symbols-bar';
import { GRID_COLUMNS, gridMove } from './symbol-grid';
import {
  ALL_SETS,
  itemKey,
  PickerItem,
  pickerItems,
  RECENT_SETS,
  setsFor,
} from './symbol-picker-model';
import { SymbolSvg } from './symbol-provider';
import { SymbolTile } from './symbol-tile';
import { SymbolService } from './symbol.service';

/** At most this many tiles at once (design 013 E18). */
export const MAX_TILES = 240;

/**
 * "Add › Symbol…" (design 013 E20, 084 E13): set (one set, all sets, recently used), search, a
 * grid of previews (APG listbox driven from the search field with `aria-activedescendant`: arrows,
 * Home/End, PageUp/PageDown, Enter adds), weight and size, the set's licence; for "My Symbols"
 * rename, delete, import and export. Data is loaded when a set is first shown (lazy chunks).
 */
@Component({
  selector: 'app-symbol-picker-dialog',
  imports: [Modal, SymbolTile, MySymbolsBar],
  template: `
    <app-modal [heading]="t.title" width="45rem" (closed)="dialogs.close()">
      <div class="top">
        <label class="field">
          <span>{{ t.set }}</span>
          <select class="input" data-testid="symbol-set" [value]="mode()" (change)="onSet($event)">
            <option [value]="allSets">{{ t.allSets }}</option>
            <option [value]="recentSets">{{ t.recent }}</option>
            @for (p of service.providers; track p.id) {
              <option [value]="p.id">{{ p.name }}</option>
            }
          </select>
        </label>
        <input
          class="input query"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="symbol-grid"
          spellcheck="false"
          autocomplete="off"
          data-autofocus
          data-testid="symbol-search"
          [attr.aria-label]="t.search"
          [attr.aria-activedescendant]="items().length ? 'symbol-' + active() : null"
          [placeholder]="t.searchPlaceholder"
          [value]="query()"
          (input)="onQuery($event)"
          (keydown)="onKey($event)"
        />
      </div>
      <div
        id="symbol-grid"
        class="grid"
        role="listbox"
        data-testid="symbol-grid"
        [attr.aria-label]="t.grid"
        [style.--cols]="cols"
      >
        @if (state() === 'loading') {
          <p class="note">{{ t.loading }}</p>
        } @else if (state() === 'failed') {
          <p class="note error" role="alert">{{ t.loadFailed }}</p>
        } @else {
          @for (s of items(); track key(s); let i = $index) {
            <!-- options of a combobox: the field keeps the focus (aria-activedescendant) -->
            <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
            <div
              class="tile"
              role="option"
              [id]="'symbol-' + i"
              [attr.data-symbol]="s.id"
              [attr.data-set]="s.set"
              [attr.aria-selected]="i === active()"
              [attr.aria-label]="label(s)"
              [title]="label(s)"
              (click)="active.set(i)"
              (dblclick)="addActive()"
            >
              @if (previews()[i]; as svg) {
                <app-symbol-tile [svg]="svg" [colored]="s.set === mine" />
              }
            </div>
          } @empty {
            <p class="note">{{ empty() }}</p>
          }
        }
      </div>
      <p class="note more">
        @if (total() > items().length) {
          {{ t.more(items().length, total()) }}
        }
      </p>
      @if (mode() === mine) {
        <app-my-symbols-bar [item]="items()[active()] ?? null" (changed)="onLibraryChanged()" />
      }
      <div class="options">
        @if (weightVariant(); as v) {
          <label class="field">
            <span>{{ t.weight }}</span>
            <input
              class="input num"
              type="number"
              data-testid="symbol-weight"
              [min]="v.min"
              [max]="v.max"
              [step]="v.step"
              [value]="weight()"
              (change)="onNumber($event, v.min, v.max, weight.set)"
            />
          </label>
        }
        <label class="field">
          <span>{{ t.size }}</span>
          <input
            class="input num"
            type="number"
            min="1"
            max="4096"
            step="1"
            data-testid="symbol-size"
            [value]="size()"
            (change)="onNumber($event, 1, 4096, size.set)"
          />
        </label>
        <span class="license">
          @if (licenseOf(); as p) {
            @if (p.license; as l) {
              <a [href]="l.url" target="_blank" rel="noopener noreferrer">{{
                t.license(p.name, l.name)
              }}</a>
            } @else {
              {{ t.ownLicense }}
            }
          }
        </span>
      </div>
      <div class="actions">
        <button type="button" class="btn" (click)="dialogs.close()">{{ t.cancel }}</button>
        <button
          type="button"
          class="btn primary"
          data-testid="symbol-add"
          [disabled]="!items().length"
          (click)="addActive()"
        >
          {{ t.add }}
        </button>
      </div>
    </app-modal>
  `,
  styleUrl: './symbol-picker-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SymbolPickerDialog {
  protected readonly dialogs = inject(DialogService);
  protected readonly service = inject(SymbolService);
  protected readonly t = TOOLS_TEXTS.symbol;
  protected readonly cols = GRID_COLUMNS;
  protected readonly allSets = ALL_SETS;
  protected readonly recentSets = RECENT_SETS;
  protected readonly mine = MINE;
  private readonly last = this.service.last();
  protected readonly mode = signal(this.validMode(this.last.set));
  protected readonly query = signal(this.last.query);
  protected readonly weight = signal(this.last.weight);
  protected readonly size = signal(this.last.size);
  protected readonly active = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  /** Bumped when data arrived or the library changed. */
  private readonly loadedVersion = signal(0);

  private readonly found = computed(() => {
    this.loadedVersion();
    this.service.library.version();
    if (this.state() !== 'ready') return { items: [], total: 0 };
    return pickerItems(
      this.mode(),
      this.service.providers,
      this.service.library.recent(),
      this.query(),
      MAX_TILES,
    );
  });
  protected readonly items = computed(() => this.found().items);
  protected readonly total = computed(() => this.found().total);
  protected readonly previews = computed<(SymbolSvg | null)[]>(() => {
    const weight = this.weight();
    return this.items().map((s) => this.service.provider(s.set)?.toSvg(s.id, { weight }) ?? null);
  });
  /** The weight field: for a stroke set, or when the list may hold one. */
  protected readonly weightVariant = computed(() => {
    const m = this.mode();
    const sets = m === ALL_SETS || m === RECENT_SETS ? this.service.providers : [this.provider(m)];
    return sets.flatMap((p) => p?.variants ?? [])[0] ?? null;
  });
  /** Whose licence the line shows: the set, or the active symbol's set. */
  protected readonly licenseOf = computed(() => {
    const m = this.mode();
    if (m !== ALL_SETS && m !== RECENT_SETS) return this.provider(m);
    const s = this.items()[this.active()];
    return s ? this.provider(s.set) : null;
  });

  constructor() {
    void this.load();
  }

  private validMode(m: string): string {
    return m === ALL_SETS || m === RECENT_SETS || this.service.provider(m) ? m : ALL_SETS;
  }

  private provider(id: string) {
    return this.service.provider(id);
  }

  private async load(): Promise<void> {
    const mode = this.mode();
    await this.service.library.refresh();
    const sets = setsFor(mode, this.service.providers, this.service.library.recent());
    this.state.set(sets.every((p) => p.loaded) ? 'ready' : 'loading');
    const results = await Promise.allSettled(sets.map((p) => p.load()));
    if (this.mode() !== mode) return;
    const failed = results.some((r) => r.status === 'rejected');
    this.state.set(failed && results.every((r) => r.status === 'rejected') ? 'failed' : 'ready');
    this.loadedVersion.update((v) => v + 1);
  }

  protected key(s: PickerItem): string {
    return itemKey(s);
  }

  protected label(s: PickerItem): string {
    const m = this.mode();
    if (m !== ALL_SETS && m !== RECENT_SETS) return s.name;
    return `${s.name} · ${this.provider(s.set)?.name ?? s.set}`;
  }

  protected empty(): string {
    if (this.query().trim()) return this.t.none;
    if (this.mode() === RECENT_SETS) return this.t.noRecent;
    if (this.mode() === MINE) return this.t.noMine;
    return this.t.none;
  }

  protected onSet(e: Event): void {
    this.mode.set(this.validMode((e.target as HTMLSelectElement).value));
    this.active.set(0);
    void this.load();
  }

  protected onQuery(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected onLibraryChanged(): void {
    this.active.update((i) => Math.min(i, Math.max(0, this.items().length - 1)));
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      void this.addActive();
      return;
    }
    // ←/→ stay with the text cursor while there is text to move in
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && this.query()) return;
    const next = gridMove(this.active(), e.key, this.items().length);
    if (next === null) return;
    e.preventDefault();
    this.active.set(next);
    queueMicrotask(() =>
      document.getElementById(`symbol-${next}`)?.scrollIntoView?.({ block: 'nearest' }),
    );
  }

  protected onNumber(e: Event, min: number, max: number, set: (v: number) => void): void {
    const el = e.target as HTMLInputElement;
    const v = Number(el.value);
    if (el.value.trim() === '' || !Number.isFinite(v)) return;
    const c = Math.min(max, Math.max(min, v));
    set(c);
    el.value = String(c);
  }

  protected async addActive(): Promise<void> {
    const s = this.items()[this.active()];
    const p = s ? this.provider(s.set) : null;
    if (!s || !p) return;
    this.service.last.set({
      set: this.mode(),
      query: this.query(),
      size: this.size(),
      weight: this.weight(),
    });
    this.dialogs.close();
    await this.service.insert(p, s.id, { size: this.size(), weight: this.weight() });
  }
}
