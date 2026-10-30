import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { FilesService } from '../files/files.service';
import { LIVE_FILL_ATTR } from './live-fill-model';
import { LiveFillService } from './live-fill.service';
import { LIVE_FILL_TEXTS as T } from './live-fill-texts';

/**
 * The "Live fill" note of the properties panel (prompt 066): a selected live fill says that its
 * outline is computed (the `d` field is read only), warns when its area is open, and offers
 * "Detach Fill" (`fill.detach`).
 */
@Component({
  selector: 'app-live-fill-section',
  template: `
    @if (fill(); as f) {
      <section class="note" data-section="live-fill" data-testid="live-fill-section" role="note">
        <strong>{{ t.section }}</strong>
        <p>{{ t.computed }}</p>
        @if (f.stale) {
          <p class="warn" data-testid="live-fill-stale">{{ t.stale }}</p>
        }
        <button
          type="button"
          class="btn"
          data-testid="live-fill-detach"
          [title]="t.detachHint"
          (click)="actions.run('fill.detach')"
        >
          {{ t.detach }}
        </button>
      </section>
    }
  `,
  styles: `
    .note {
      margin: var(--space-2) 0;
      padding: var(--space-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      font-size: var(--font-size-small);
    }
    p {
      margin: var(--space-1) 0;
      color: var(--color-text-muted);
    }
    .warn {
      color: var(--color-warning);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveFillSection {
  private readonly files = inject(FilesService);
  private readonly service = inject(LiveFillService);
  protected readonly actions = inject(ActionService);
  protected readonly t = T;
  protected readonly fill = computed(() => {
    const store = this.files.store();
    if (!store) return null;
    store.revision();
    const fills = store
      .selection()
      .filter((r) => store.document().node(r)?.hasAttribute(LIVE_FILL_ATTR));
    if (!fills.length) return null;
    return { stale: fills.some((r) => this.service.isStale(r)) };
  });
}
