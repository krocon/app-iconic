import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';
import { language } from '../../core/i18n/i18n';
import { RecoveryEntry } from '../../core/recovery/recovery.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Modal } from '../../shared/dialog/modal';
import { RecoveryService } from './recovery.service';
import { RECOVERY_TEXTS } from './recovery-texts';

/**
 * The recovery offer (prompt 083 E5): the snapshots apps that are gone left behind, newest first,
 * each with "Restore" and "Discard"; "Later" keeps them for the next start and File › Recover
 * Unsaved Documents…. A list of buttons – Tab moves through them, the first "Restore" has the
 * focus.
 */
@Component({
  selector: 'app-recovery-dialog',
  imports: [Modal],
  template: `
    <app-modal
      [heading]="t.title"
      width="34rem"
      describedBy="recovery-intro"
      (closed)="dialogs.close()"
    >
      <p id="recovery-intro" class="intro">
        {{ recovery.entries().length ? t.intro : t.none }}
      </p>
      @if (recovery.entries().length) {
        <ul class="list" data-testid="recovery-list">
          @for (e of recovery.entries(); track e.id; let first = $first) {
            <li class="entry" data-testid="recovery-entry">
              <div class="text">
                <span class="name">{{ name(e) }}</span>
                <span class="meta">{{ e.location ?? t.unsavedLocation }}</span>
                <span class="meta">{{ t.savedAt(when(e)) }}</span>
              </div>
              <button
                type="button"
                class="btn"
                data-testid="recovery-discard"
                [attr.aria-label]="t.discardLabel(name(e))"
                (click)="discard(e.id)"
              >
                {{ t.discard }}
              </button>
              <button
                type="button"
                class="btn primary"
                data-testid="recovery-restore"
                [attr.aria-label]="t.restoreLabel(name(e))"
                [attr.data-autofocus]="first ? '' : null"
                (click)="recovery.restore(e.id)"
              >
                {{ t.restore }}
              </button>
            </li>
          }
        </ul>
        <p class="hint">{{ t.oneWindow }}</p>
        <p class="hint">{{ t.laterHint }}</p>
      }
      <div class="actions">
        <button
          type="button"
          class="btn"
          data-testid="recovery-later"
          [attr.data-autofocus]="recovery.entries().length ? null : ''"
          (click)="dialogs.close()"
        >
          {{ t.later }}
        </button>
      </div>
    </app-modal>
  `,
  styles: `
    .intro {
      margin: 0 0 var(--space-2);
      line-height: 1.5;
    }
    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      max-height: 18rem;
      overflow: auto;
    }
    .entry {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
    }
    .text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .meta,
    .hint {
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
      overflow-wrap: anywhere;
    }
    .hint {
      margin: var(--space-2) 0 0;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecoveryDialog {
  protected readonly t = RECOVERY_TEXTS;
  protected readonly dialogs = inject(DialogService);
  protected readonly recovery = inject(RecoveryService);
  private readonly format = computed(
    () => new Intl.DateTimeFormat(language(), { dateStyle: 'medium', timeStyle: 'short' }),
  );

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** Discard; the focus moves on to the next "Restore" (or "Later") – it never drops out. */
  protected async discard(id: string): Promise<void> {
    await this.recovery.discard(id);
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>(
            '[data-testid="recovery-restore"], [data-testid="recovery-later"]',
          )
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected name(e: RecoveryEntry): string {
    return e.name ?? this.t.untitled;
  }

  protected when(e: RecoveryEntry): string {
    return this.format().format(new Date(e.savedAt));
  }
}
