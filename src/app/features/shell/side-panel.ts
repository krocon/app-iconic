import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A titled side panel of the window (command sidebar, hierarchy, properties). */
@Component({
  selector: 'app-side-panel',
  template: `
    <h2 class="title">{{ heading() }}</h2>
    <div class="body" [class.flush]="flush()"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: var(--color-surface);
    }
    .title {
      margin: 0;
      padding: var(--space-2) var(--space-3);
      font-size: var(--font-size-small);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-muted);
      border-bottom: 1px solid var(--color-border);
    }
    .body {
      flex: 1;
      overflow: auto;
      padding: var(--space-3);
      color: var(--color-text-muted);

      /* the content scrolls itself (the hierarchy tree) */
      &.flush {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: var(--space-1);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'region', '[attr.aria-label]': 'heading()' },
})
export class SidePanel {
  readonly heading = input.required<string>();
  readonly flush = input(false);
}
