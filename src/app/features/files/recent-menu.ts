import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { FilesService } from './files.service';
import { FILES_TEXTS } from './files-texts';
import { RecentFilesService } from './recent-files.service';

/**
 * "Open Recent ▸" as a toolbar menu until the real menus of prompt 005 (legacy §4): validated
 * when opened, "No Recent Items", "Clear Menu". Arrow keys move, Escape closes.
 */
@Component({
  selector: 'app-recent-menu',
  template: `
    <button
      #trigger
      type="button"
      class="btn quiet"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      {{ t.openRecent }} ▾
    </button>
    @if (open()) {
      <div
        class="menu"
        role="menu"
        tabindex="-1"
        [attr.aria-label]="t.openRecent"
        (keydown)="onKey($event)"
      >
        @for (f of recent.files(); track f.path) {
          <button
            type="button"
            role="menuitem"
            class="item"
            [title]="f.path"
            (click)="choose(f.path)"
          >
            {{ f.name }}
          </button>
        } @empty {
          <button type="button" role="menuitem" class="item" disabled>{{ t.noRecent }}</button>
        }
        <hr />
        <button
          type="button"
          role="menuitem"
          class="item"
          [disabled]="recent.files().length === 0"
          (click)="clear()"
        >
          {{ t.clearRecent }}
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
    }
    .menu {
      position: absolute;
      top: calc(100% + 2px);
      left: 0;
      z-index: 10;
      min-width: 16rem;
      max-width: 28rem;
      display: flex;
      flex-direction: column;
      padding: var(--space-1);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      box-shadow: var(--shadow-popup);
    }
    .item {
      height: var(--control-height);
      padding: 0 var(--space-2);
      font: inherit;
      text-align: left;
      color: var(--color-text);
      background: none;
      border: 0;
      border-radius: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
      &:hover:not(:disabled),
      &:focus-visible {
        background: var(--color-hover);
      }
      &:disabled {
        color: var(--color-text-muted);
        cursor: default;
      }
    }
    hr {
      width: 100%;
      margin: var(--space-1) 0;
      border: 0;
      border-top: 1px solid var(--color-border);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerdown)': 'onOutside($event)' },
})
export class RecentMenu {
  protected readonly recent = inject(RecentFilesService);
  private readonly files = inject(FilesService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly t = FILES_TEXTS;
  protected readonly open = signal(false);

  protected async toggle(): Promise<void> {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    await this.recent.refresh();
    this.open.set(true);
    setTimeout(() =>
      (this.items()[0] ?? this.host.nativeElement.querySelector<HTMLElement>('.menu'))?.focus(),
    );
  }

  protected choose(path: string): void {
    this.close();
    void this.files.openRecent(path);
  }

  protected clear(): void {
    this.close();
    void this.recent.clear();
  }

  protected onKey(e: KeyboardEvent): void {
    const items = this.items();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(i + step + items.length) % items.length]?.focus();
    }
  }

  protected onOutside(e: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  private close(): void {
    this.open.set(false);
    this.host.nativeElement.querySelector<HTMLButtonElement>('button')?.focus();
  }

  private items(): HTMLButtonElement[] {
    return [
      ...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.menu .item:not(:disabled)'),
    ];
  }
}
