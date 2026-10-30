import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { COMMAND_ICONS } from '../commands/command-icons';
import { HIERARCHY_TEXTS } from './hierarchy-texts';

/** The quick actions of the tree head (prompt 072 E3/E4): ids and their 16 × 16 icons. */
const QUICK: { id: string; icon: string }[] = [
  { id: 'add.iconGroup', icon: COMMAND_ICONS['add.iconGroup'] ?? '' },
  { id: 'add.layer', icon: COMMAND_ICONS['add.layer'] ?? '' },
  { id: 'hierarchy.collapseAll', icon: 'M3 6l5-4 5 4 M3 14l5-4 5 4' },
  { id: 'hierarchy.expandAll', icon: 'M3 2l5 4 5-4 M3 10l5 4 5-4' },
];

/**
 * The head of the tree (prompt 072): the filter (name, id, tag – `tree-filter.ts`) with its count,
 * then "+ Group", "+ Layer", "Collapse All", "Expand All" as action buttons. ↓ / Enter leave the
 * filter for the first match, Esc clears it.
 */
@Component({
  selector: 'app-tree-toolbar',
  template: `
    <div class="bar" role="toolbar" [attr.aria-label]="t.tools">
      <input
        #field
        type="search"
        class="filter"
        data-testid="tree-filter"
        [placeholder]="t.filterPlaceholder"
        [attr.aria-label]="t.filter"
        [attr.aria-describedby]="query() ? 'tree-filter-count' : null"
        [value]="query()"
        (input)="query.set(field.value)"
        (keydown)="onKey($event)"
      />
      @for (q of quick; track q.id) {
        <button
          type="button"
          class="quick"
          [attr.data-action]="q.id"
          [attr.aria-label]="actions.label(q.id)"
          [title]="actions.label(q.id)"
          [disabled]="!actions.enabled(q.id)"
          (click)="actions.run(q.id)"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path [attr.d]="q.icon" /></svg>
        </button>
      }
    </div>
    @if (query()) {
      <div id="tree-filter-count" class="count" aria-live="polite" data-testid="tree-filter-count">
        {{ countText() }}
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: var(--space-1) var(--space-2);
      border-bottom: 1px solid var(--color-border);
    }
    .bar {
      display: flex;
      gap: 2px;
      align-items: center;
    }
    .filter {
      flex: 1;
      min-width: 0;
      height: 22px;
      padding: 0 var(--space-2);
      color: var(--color-text);
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      font: inherit;
      font-size: var(--font-size-small);
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: -1px;
      }
    }
    .quick {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      color: var(--color-text);
      background: none;
      border: 0;
      border-radius: var(--radius);
      &:hover:not(:disabled) {
        background: var(--color-hover);
      }
      &:disabled {
        opacity: 0.4;
      }
      &:focus-visible {
        outline: 2px solid var(--color-focus);
        outline-offset: -2px;
      }
      svg {
        width: 14px;
        height: 14px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.3;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }
    .count {
      padding-top: 2px;
      color: var(--color-text-muted);
      font-size: var(--font-size-small);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeToolbar {
  protected readonly t = HIERARCHY_TEXTS;
  protected readonly actions = inject(ActionService);
  protected readonly quick = QUICK;
  readonly query = model('');
  readonly matches = input(0);
  /** ↓ or Enter: go to the first match (Enter also selects it). */
  readonly leave = output<{ select: boolean }>();
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly countText = computed(() =>
    this.matches() ? this.t.matches(this.matches()) : this.t.noMatches,
  );

  focus(): void {
    const f = this.field().nativeElement;
    f.focus();
    f.select();
  }

  protected onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.query()) {
      this.query.set('');
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      this.leave.emit({ select: e.key === 'Enter' });
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }
}
