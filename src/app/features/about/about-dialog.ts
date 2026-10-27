import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AboutApi } from '../../core/about/about-api';
import { AppInfo } from '../../core/about/about.models';
import { Modal } from '../../shared/dialog/modal';
import { DialogService } from '../../shared/dialog/dialog.service';
import { SYMBOL_PROVIDERS } from '../symbols/symbol-providers';
import { ABOUT_TEXTS } from './about-texts';

/**
 * About: app icon, version and platform from the backend, the licences of the symbol sets
 * (design 013 E22, CLAUDE.md §7), the repository and the licence texts of every component inside the
 * app on demand (design 030 E7).
 */
@Component({
  selector: 'app-about-dialog',
  imports: [Modal],
  template: `
    <app-modal [heading]="t.title" width="26rem" (closed)="dialogs.close()">
      <div class="about">
        <img class="logo" src="icon.svg" alt="" />
        <p class="tagline">{{ t.tagline }}</p>
        @if (info(); as i) {
          <p class="meta">{{ t.version(i.version, i.os, i.arch) }}</p>
        } @else {
          <p class="meta">{{ t.noBackend }}</p>
        }
        <p class="meta">{{ t.copyright }}</p>
        @for (p of symbols; track p.id) {
          <p class="meta" data-testid="about-symbols">
            {{ t.symbols }} {{ p.name }} (<a
              [href]="p.license.url"
              target="_blank"
              rel="noopener noreferrer"
              >{{ p.license.name }}</a
            >)
          </p>
        }
        <p class="meta">
          <a [href]="repo" target="_blank" rel="noopener noreferrer">{{ t.repo }}</a>
        </p>
        <button
          type="button"
          class="btn"
          data-testid="about-notices"
          [attr.aria-expanded]="notices() !== null"
          (click)="toggleNotices()"
        >
          {{ notices() === null ? t.notices : t.noticesHide }}
        </button>
        @if (notices(); as text) {
          <pre class="notices" tabindex="0" [attr.aria-label]="t.noticesLabel">{{ text }}</pre>
        }
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-autofocus (click)="dialogs.close()">
          {{ t.close }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .about {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      text-align: center;
    }
    .logo {
      width: 96px;
      height: 96px;
      margin: var(--space-2) 0;
    }
    .tagline {
      margin: 0 0 var(--space-2);
    }
    .meta {
      margin: 0;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);

      a {
        color: inherit;
      }
    }
    .actions {
      display: flex;
      justify-content: flex-end;
    }
    .notices {
      align-self: stretch;
      max-height: 16rem;
      overflow: auto;
      margin: var(--space-1) 0 0;
      padding: var(--space-2);
      text-align: left;
      white-space: pre-wrap;
      font-family: var(--font-mono);
      font-size: var(--font-size-small);
      background: var(--color-surface-2);
      border-radius: var(--radius);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutDialog {
  protected readonly dialogs = inject(DialogService);
  protected readonly info = signal<AppInfo | null>(null);
  protected readonly symbols = SYMBOL_PROVIDERS;
  protected readonly t = ABOUT_TEXTS;
  protected readonly repo = 'https://github.com/krocon/app-iconic';
  /** The licence texts while shown (loaded on demand, ~600 KB). */
  protected readonly notices = signal<string | null>(null);
  private readonly api = inject(AboutApi);

  protected toggleNotices(): void {
    if (this.notices() !== null) {
      this.notices.set(null);
      return;
    }
    this.api
      .thirdPartyNotices()
      .then((text) => this.notices.set(text))
      .catch(() => this.notices.set(this.t.noticesFailed));
  }

  constructor() {
    this.api
      .appInfo()
      .then((i) => this.info.set(i))
      .catch(() => this.info.set(null));
  }
}
