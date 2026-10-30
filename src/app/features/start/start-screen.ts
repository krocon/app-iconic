import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { gridMove } from '../symbols/symbol-grid';
import { StartSection, StartService } from './start.service';
import { START_TEXTS } from './start-texts';
import { TemplateId } from './start-templates';

/** Cells per row of both grids (design 082 E3). */
export const START_COLUMNS = 4;

const rows = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / START_COLUMNS) }, (_, r) =>
    items.slice(r * START_COLUMNS, (r + 1) * START_COLUMNS),
  );

/**
 * The start screen (design 082 E2/E3): in the window instead of the workspace, not modal. Two
 * WAI-ARIA grids – recently used icons (preview, name, folder) and templates – with one tab stop
 * each, arrow keys, Home/End, PageUp/PageDown, Enter/Space to open; buttons for a blank icon and
 * Open…; Esc goes back to the document behind it.
 */
@Component({
  selector: 'app-start-screen',
  template: `
    <section class="start" aria-labelledby="start-title" data-testid="start-screen">
      <header class="head">
        <h1 id="start-title">{{ t.welcome }}</h1>
        <div class="buttons">
          <button type="button" class="btn primary" data-testid="start-blank" (click)="svc.blank()">
            {{ t.blank }}
          </button>
          <button type="button" class="btn" data-testid="start-open" (click)="svc.open()">
            {{ t.open }}
          </button>
          @if (svc.canClose()) {
            <button type="button" class="btn quiet" data-testid="start-close" (click)="svc.close()">
              {{ t.close }}
            </button>
          }
        </div>
      </header>
      <h2 id="start-recent">{{ t.recent }}</h2>
      @if (svc.entries().length) {
        <div
          role="grid"
          class="grid"
          aria-labelledby="start-recent"
          data-grid="recent"
          data-testid="start-recent"
        >
          @for (row of recentRows(); track $index; let r = $index) {
            <div role="row" class="row">
              @for (e of row; track e.path; let c = $index) {
                <div
                  role="gridcell"
                  class="cell"
                  [attr.data-index]="r * columns + c"
                  [attr.tabindex]="active().recent === r * columns + c ? 0 : -1"
                  [attr.aria-label]="t.recentCell(e.name, e.location)"
                  [title]="e.path"
                  (click)="activate('recent', r * columns + c)"
                  (keydown)="onKey($event, 'recent')"
                  (focus)="moved('recent', r * columns + c)"
                >
                  @if (e.thumbnail) {
                    <img class="preview" [src]="e.thumbnail" alt="" />
                  } @else {
                    <span class="preview none">{{ t.noPreview }}</span>
                  }
                  <span class="name">{{ e.name }}</span>
                  <span class="hint">{{ e.location }}</span>
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <p class="empty" data-testid="start-no-recent">{{ t.noRecent }}</p>
      }
      <h2 id="start-templates">{{ t.templates }}</h2>
      <div
        role="grid"
        class="grid"
        aria-labelledby="start-templates"
        data-grid="templates"
        data-testid="start-templates"
      >
        @for (row of templateRows(); track $index; let r = $index) {
          <div role="row" class="row">
            @for (tpl of row; track tpl.id; let c = $index) {
              <div
                role="gridcell"
                class="cell"
                [attr.data-index]="r * columns + c"
                [attr.data-template]="tpl.id"
                [attr.tabindex]="active().templates === r * columns + c ? 0 : -1"
                [attr.aria-label]="t.templateNames[tpl.id] + ', ' + t.templateHints[tpl.id]"
                (click)="activate('templates', r * columns + c)"
                (keydown)="onKey($event, 'templates')"
                (focus)="moved('templates', r * columns + c)"
              >
                <img class="preview" [src]="tpl.preview" alt="" />
                <span class="name">{{ t.templateNames[tpl.id] }}</span>
                <span class="hint">{{ t.templateHints[tpl.id] }}</span>
              </div>
            }
          </div>
        }
      </div>
    </section>
  `,
  styleUrl: './start-screen.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StartScreen {
  protected readonly svc = inject(StartService);
  protected readonly t = START_TEXTS;
  protected readonly columns = START_COLUMNS;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly templates = this.svc.templates();
  protected readonly recentRows = computed(() => rows(this.svc.entries()));
  protected readonly templateRows = computed(() => rows(this.templates));
  /** The cell of each grid that holds its tab stop. */
  protected readonly active = signal<Record<StartSection, number>>({ recent: 0, templates: 0 });

  constructor() {
    // every `show` (and the first list) moves the focus into the wanted section
    effect(() => {
      this.svc.shown();
      const section = this.svc.section();
      const has = this.svc.entries().length > 0;
      afterNextRender(() => this.focus(section === 'recent' && has ? 'recent' : 'templates', 0), {
        injector: this.injector,
      });
    });
  }

  private count(section: StartSection): number {
    return section === 'recent' ? this.svc.entries().length : this.templates.length;
  }

  protected moved(section: StartSection, index: number): void {
    this.active.update((a) => ({ ...a, [section]: index }));
  }

  private focus(section: StartSection, index: number): void {
    this.moved(section, index);
    const cell = this.host.nativeElement.querySelector<HTMLElement>(
      `[data-grid="${section}"] [data-index="${index}"]`,
    );
    cell?.focus();
  }

  protected activate(section: StartSection, index: number): void {
    if (section === 'recent') {
      const e = this.svc.entries()[index];
      if (e) void this.svc.openRecent(e.path);
    } else {
      const tpl = this.templates[index];
      if (tpl) void this.svc.openTemplate(tpl.id as TemplateId);
    }
  }

  /** The grid's keys (APG Grid); handled keys never reach the global shortcuts. */
  protected onKey(e: KeyboardEvent, section: StartSection): void {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const index = this.active()[section];
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.activate(section, index);
      return;
    }
    if (e.key === 'Escape') {
      if (this.svc.close()) e.preventDefault();
      return;
    }
    const next = gridMove(index, e.key, this.count(section), START_COLUMNS);
    if (next === null) return;
    e.preventDefault();
    this.focus(section, next);
  }
}
