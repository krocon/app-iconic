import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { TOOLS_TEXTS } from '../tools/tools-texts';
import { GRID_COLUMNS, gridMove } from './symbol-grid';
import { SymbolProvider } from './symbol-provider';
import { SymbolService } from './symbol.service';

/** At most this many tiles at once (design 013 E18). */
export const MAX_TILES = 240;

/**
 * "Add › Symbol…" (design 013 E20): set, search, a grid of previews (APG listbox driven from the
 * search field with `aria-activedescendant`: arrows, Home/End, PageUp/PageDown, Enter adds),
 * weight and size, the set's licence. The data is loaded when the picker opens (lazy chunk).
 */
@Component({
  selector: 'app-symbol-picker-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.title" width="45rem" (closed)="dialogs.close()">
      <div class="top">
        @if (service.providers.length > 1) {
          <label class="field">
            <span>{{ t.set }}</span>
            <select class="input" [value]="provider().id" (change)="onSet($event)">
              @for (p of service.providers; track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
          </label>
        }
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
          @for (s of items(); track s.id; let i = $index) {
            <!-- options of a combobox: the field keeps the focus (aria-activedescendant) -->
            <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
            <div
              class="tile"
              role="option"
              [id]="'symbol-' + i"
              [attr.data-symbol]="s.id"
              [attr.aria-selected]="i === active()"
              [attr.aria-label]="s.name"
              [title]="s.name"
              (click)="active.set(i)"
              (dblclick)="addActive()"
            >
              @if (svgOf(s.id); as svg) {
                <svg aria-hidden="true" [attr.viewBox]="'0 0 ' + svg.width + ' ' + svg.height">
                  <g
                    fill="none"
                    stroke="currentColor"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    [attr.stroke-width]="weight()"
                  >
                    @for (c of svg.group.children; track $index) {
                      <path
                        [attr.d]="c.attrs['d']"
                        [attr.fill]="c.attrs['fill'] ? 'currentColor' : null"
                      />
                    }
                  </g>
                </svg>
              }
            </div>
          } @empty {
            <p class="note">{{ t.none }}</p>
          }
        }
      </div>
      <p class="note more">
        @if (total() > items().length) {
          {{ t.more(items().length, total()) }}
        }
      </p>
      <div class="options">
        @for (v of provider().variants; track v.key) {
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
          <a [href]="provider().license.url" target="_blank" rel="noopener noreferrer">{{
            t.license(provider().name, provider().license.name)
          }}</a>
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
  private readonly last = this.service.last();
  protected readonly provider = signal<SymbolProvider>(
    this.service.provider(this.last.set) ?? this.service.providers[0],
  );
  protected readonly query = signal(this.last.query);
  protected readonly weight = signal(this.last.weight);
  protected readonly size = signal(this.last.size);
  protected readonly active = signal(0);
  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');

  private readonly found = computed(() =>
    this.state() === 'ready'
      ? this.provider().search(this.query(), MAX_TILES)
      : { items: [], total: 0 },
  );
  protected readonly items = computed(() => this.found().items);
  protected readonly total = computed(() => this.found().total);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    const p = this.provider();
    this.state.set(p.loaded ? 'ready' : 'loading');
    try {
      await p.load();
      if (this.provider() === p) this.state.set('ready');
    } catch {
      if (this.provider() === p) this.state.set('failed');
    }
  }

  protected svgOf(id: string) {
    return this.provider().toSvg(id);
  }

  protected onSet(e: Event): void {
    const p = this.service.provider((e.target as HTMLSelectElement).value);
    if (!p) return;
    this.provider.set(p);
    this.active.set(0);
    void this.load();
  }

  protected onQuery(e: Event): void {
    this.query.set((e.target as HTMLInputElement).value);
    this.active.set(0);
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
    if (!s) return;
    const p = this.provider();
    this.service.last.set({
      set: p.id,
      query: this.query(),
      size: this.size(),
      weight: this.weight(),
    });
    this.dialogs.close();
    await this.service.insert(p, s.id, { size: this.size(), weight: this.weight() });
  }
}
