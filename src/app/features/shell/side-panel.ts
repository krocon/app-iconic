import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';

/** Chevron towards the side the panel folds to (`start` = left, `end` = right). */
const CHEVRON = { start: 'M10 4l-4 4 4 4', end: 'M6 4l4 4-4 4' } as const;

export type PanelSide = 'start' | 'end';

/**
 * A titled side panel of the window (command sidebar, hierarchy, properties). A click on the
 * title folds it to a narrow strip (`PanelStrip`) through its view action (⌘1/⌘2/⌘3, design
 * 005 E12) – a disclosure button in the heading.
 */
@Component({
  selector: 'app-side-panel',
  template: `
    <h2 class="title">
      @if (toggle(); as id) {
        <button
          type="button"
          class="fold"
          aria-expanded="true"
          [title]="actions.tooltip(id)"
          (click)="actions.run(id)"
        >
          <span class="text">{{ heading() }}</span>
          <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
            <path [attr.d]="chevron()" />
          </svg>
        </button>
      } @else {
        {{ heading() }}
      }
    </h2>
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
    .fold {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: calc(100% + 2 * var(--space-2));
      margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-2));
      padding: var(--space-1) var(--space-2);
      font: inherit;
      letter-spacing: inherit;
      text-transform: inherit;
      color: inherit;
      background: none;
      border: none;
      border-radius: var(--radius);
      cursor: default;

      &:hover {
        background: var(--color-hover);
        color: var(--color-text);
      }
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: -2px;
      }
    }
    .text {
      flex: 1;
      text-align: start;
    }
    .chevron {
      width: 12px;
      height: 12px;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      opacity: 0.7;
    }
    .fold:hover .chevron {
      opacity: 1;
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
  protected readonly actions = inject(ActionService);
  readonly heading = input.required<string>();
  readonly flush = input(false);
  /** The view action that shows / folds this panel. */
  readonly toggle = input<string | null>(null);
  /** The side of the window the panel sits on (it folds that way). */
  readonly side = input<PanelSide>('start');
  protected readonly chevron = computed(() => CHEVRON[this.side()]);
}

/**
 * A folded side panel: a narrow strip with the vertical title, or with `tools` (projected, the
 * icons of the commands) under the unfold button; a click on the button unfolds it again.
 */
@Component({
  selector: 'app-panel-strip',
  template: `
    <button
      type="button"
      class="strip"
      aria-expanded="false"
      [attr.aria-label]="heading()"
      [title]="actions.tooltip(toggle())"
      (click)="actions.run(toggle())"
    >
      <svg class="chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path [attr.d]="chevron()" />
      </svg>
      @if (!tools()) {
        <span class="text">{{ heading() }}</span>
      }
    </button>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: none;
      width: 28px;
      min-height: 0;
      background: var(--color-surface);
    }
    .strip {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      flex: 1;
      width: 100%;
      padding: var(--space-2) 0;
      font: inherit;
      font-size: var(--font-size-small);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-muted);
      background: none;
      border: none;
      cursor: default;

      &:hover {
        background: var(--color-hover);
        color: var(--color-text);
      }
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: -2px;
      }
    }
    :host(.with-tools) .strip {
      flex: none;
      padding: var(--space-1) 0;
    }
    .text {
      writing-mode: vertical-rl;
      white-space: nowrap;
    }
    .chevron {
      width: 12px;
      height: 12px;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.with-tools]': 'tools()' },
})
export class PanelStrip {
  protected readonly actions = inject(ActionService);
  readonly heading = input.required<string>();
  readonly toggle = input.required<string>();
  /** The strip holds tools (projected content) instead of the vertical title. */
  readonly tools = input(false);
  /** The side of the window the panel sits on (the chevron points inward to unfold). */
  readonly side = input<PanelSide>('start');
  protected readonly chevron = computed(() => CHEVRON[this.side() === 'start' ? 'end' : 'start']);
}
