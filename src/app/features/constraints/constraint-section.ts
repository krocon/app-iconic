import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActionService } from '../../core/actions/action.service';
import { isDimension } from '../../shared/geometry/constraints/constraints';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { nodeLabel } from '../hierarchy/node-label';
import { CID_ATTR, elementsByCid } from './constraint-storage';
import { ConstraintService } from './constraint.service';
import { CONSTRAINT_TEXTS as T } from './constraint-texts';
import { GLYPHS, valueText } from './constraint-view';

/** One row of the section: a constraint of the selected element. */
export interface ConstraintRow {
  asset: string;
  id: string;
  glyph: string;
  name: string;
  value: string | null;
  /** The other elements it binds (label + ref). */
  partners: { label: string; ref: NodeRef }[];
  broken: boolean;
}

/**
 * The "Constraints" section of the properties panel (prompt 065): the constraints of the selected
 * elements – type, value, the elements they bind (one click selects them), whether they hold – each
 * with Remove. Hidden when the selection has none.
 */
@Component({
  selector: 'app-constraint-section',
  template: `
    @if (rows().length) {
      <section class="section" data-section="constraints" data-testid="constraint-section">
        <h3 class="section-title">{{ t.section }}</h3>
        <ul class="list">
          @for (r of rows(); track r.asset + r.id) {
            <li class="row" [class.broken]="r.broken" [attr.data-id]="r.id">
              <span class="glyph" aria-hidden="true">{{ r.glyph }}</span>
              <span class="name">
                {{ r.name }}
                @if (r.value) {
                  <span class="value">{{ r.value }}</span>
                }
                @if (r.broken) {
                  <span class="warn">{{ t.broken(1) }}</span>
                }
              </span>
              @for (p of r.partners; track p.ref.id) {
                <button
                  type="button"
                  class="btn quiet partner"
                  [title]="t.selectPartner"
                  (click)="selectPartner(p.ref)"
                >
                  {{ t.with }} {{ p.label }}
                </button>
              }
              <button
                type="button"
                class="tool"
                data-testid="constraint-row-remove"
                [attr.aria-label]="t.remove + ': ' + r.name"
                [title]="t.remove"
                (click)="remove(r)"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </li>
          }
        </ul>
      </section>
    }
  `,
  styleUrl: './constraint-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConstraintSection {
  private readonly files = inject(FilesService);
  private readonly service = inject(ConstraintService);
  private readonly actions = inject(ActionService);
  protected readonly t = T;

  protected readonly rows = computed((): ConstraintRow[] => {
    const store = this.files.store();
    if (!store) return [];
    store.revision();
    const doc = store.document();
    const out: ConstraintRow[] = [];
    const seen = new Set<string>();
    for (const ref of store.selection()) {
      const el = doc.node(ref);
      const cid = el?.getAttribute(CID_ATTR);
      const root = doc.asset(ref.asset)?.svg?.root;
      if (!el || !cid || !root) continue;
      const list = this.service.list(ref.asset);
      if (!list.length) continue;
      const broken = new Set(this.service.broken(ref.asset));
      const els = elementsByCid(root);
      for (const c of list) {
        const cids = c.refs.map((r) => r.slice(0, r.indexOf('.')));
        if (!cids.includes(cid) || seen.has(`${ref.asset}:${c.id}`)) continue;
        seen.add(`${ref.asset}:${c.id}`);
        const partners = [...new Set(cids.filter((x) => x !== cid))].flatMap((x) => {
          const p = els.get(x);
          const pr = p ? doc.refOf(p) : null;
          return p && pr ? [{ label: nodeLabel(p), ref: pr }] : [];
        });
        out.push({
          asset: ref.asset,
          id: c.id,
          glyph: GLYPHS[c.type] ?? '?',
          name: T.types[c.type],
          value: isDimension(c.type) ? valueText(c) : null,
          partners,
          broken: broken.has(c.id),
        });
      }
    }
    return out;
  });

  protected selectPartner(ref: NodeRef): void {
    this.files.store()?.select([ref]);
  }

  protected remove(r: ConstraintRow): void {
    this.actions.run('constraint.remove', { asset: r.asset, id: r.id });
  }
}
