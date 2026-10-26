import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DocumentStore } from '../document/document.store';
import { groups, layers } from '../document/model/icon-json';
import { HIERARCHY_TEXTS } from './hierarchy-texts';

interface Row {
  name: string;
  image: string | null;
  missing: boolean;
  opacity: number | null;
}

/**
 * PLACEHOLDER until prompt 006 (design 003 E16): groups → layers and the assets of the open
 * document as plain lists, so that opening, import and undo can be seen and tested.
 */
@Component({
  selector: 'app-hierarchy-list',
  template: `
    <h3 class="sub">{{ t.groups }}</h3>
    <ol class="groups" [attr.aria-label]="t.groups">
      @for (g of rows(); track $index) {
        <li class="group">
          <span class="gname">{{ t.group($index + 1) }}</span>
          <ul class="layers">
            @for (l of g; track $index) {
              <li class="layer" [class.missing]="l.missing">
                {{ l.name }}
                <span class="meta">
                  {{ l.image ?? t.noImage }}
                  @if (l.missing) {
                    ({{ t.missing }})
                  }
                  @if (l.opacity !== null) {
                    · {{ t.opacity(l.opacity) }}
                  }
                </span>
              </li>
            }
          </ul>
        </li>
      } @empty {
        <li class="empty">{{ t.noGroups }}</li>
      }
    </ol>
    <h3 class="sub">{{ t.assets }}</h3>
    <ul class="assets" [attr.aria-label]="t.assets">
      @for (a of assets(); track a) {
        <li class="asset">{{ a }}</li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
      color: var(--color-text);
    }
    .sub {
      margin: 0 0 var(--space-1);
      font-size: var(--font-size-small);
      font-weight: 600;
      color: var(--color-text-muted);
    }
    ol,
    ul {
      margin: 0 0 var(--space-3);
      padding: 0;
      list-style: none;
    }
    .group {
      margin-bottom: var(--space-2);
    }
    .gname {
      font-weight: 600;
    }
    .layer,
    .asset {
      padding: 2px 0 2px var(--space-3);
      overflow-wrap: anywhere;
    }
    .meta {
      display: block;
      font-size: var(--font-size-small);
      color: var(--color-text-muted);
    }
    .missing .meta {
      color: var(--color-warning);
    }
    .empty {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HierarchyList {
  readonly store = input.required<DocumentStore>();
  protected readonly t = HIERARCHY_TEXTS;

  protected readonly rows = computed<Row[][]>(() => {
    const doc = this.store().document();
    return groups(doc.iconJson).map((g) =>
      layers(g).map((l) => {
        const image = typeof l['image-name'] === 'string' ? l['image-name'] : null;
        return {
          name: typeof l.name === 'string' ? l.name : this.t.layer,
          image,
          missing: image !== null && !doc.asset(image),
          opacity: typeof l.opacity === 'number' ? l.opacity : null,
        };
      }),
    );
  });

  protected readonly assets = computed(() => [...this.store().document().assets.keys()]);
}
