import { inject, Injectable, signal } from '@angular/core';
import { DialogService } from '../../shared/dialog/dialog.service';
import { optimizePath, OptimizeOptions } from '../../shared/geometry/path-optimize';
import {
  AttributeChange,
  CommandError,
  DocCommand,
  MAX_CHANGES,
  ReplaceAssetMarkup,
  ReplaceNode,
  SetAttributes,
} from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { NodeRef } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { ID_ATTR, serializeAsset, serializeElement } from '../document/svg/node-ids';
import { FilesService } from '../files/files.service';
import { mapSelection } from './selection-map';
import { checkSource, SourceKind } from './svg-source-check';
import { SVG_SOURCE_TEXTS as T } from './svg-source-texts';

/**
 * "Edit SVG…" and "Optimize Path" of the window's document (design 011): which source the
 * selection edits (E2), applying edited text as one command (E5) with the selection kept (E6), and
 * the optimizer over the selected paths (E12). Root service like the `EditService` (one document
 * per window); the dialogs show what this service computes.
 */

export type SourceTarget = { kind: 'node'; ref: NodeRef } | { kind: 'asset'; asset: string };

export type ApplyResult = 'ok' | 'invalid' | 'failed';

export interface OptimizeStats {
  paths: number;
  changed: number;
  pointsBefore: number;
  pointsAfter: number;
  charsBefore: number;
  charsAfter: number;
}

@Injectable({ providedIn: 'root' })
export class SvgSourceService {
  private readonly files = inject(FilesService);
  private readonly dialogs = inject(DialogService);
  /** What the open "Edit SVG" dialog edits (fixed when it opens). */
  readonly editing = signal<SourceTarget | null>(null);

  store(): DocumentStore | null {
    return this.files.store();
  }

  /** The source the selection edits: one node, or the asset of a root `<svg>` / layer / group. */
  target(): SourceTarget | null {
    const s = this.store();
    if (!s) return null;
    const doc = s.document();
    const nodes = s.selection();
    if (nodes.length === 1) {
      const el = doc.node(nodes[0]);
      if (!el) return null;
      return el.parentElement
        ? { kind: 'node', ref: nodes[0] }
        : { kind: 'asset', asset: nodes[0].asset };
    }
    const items = s.items();
    if (nodes.length || items.length !== 1 || items[0].kind === 'root') return null;
    const item = items[0];
    const g = groups(doc.iconJson)[item.group];
    const name = layers(g)[item.kind === 'layer' ? item.layer : 0]?.['image-name'];
    const asset = typeof name === 'string' ? doc.asset(name) : undefined;
    return asset?.svg ? { kind: 'asset', asset: asset.name } : null;
  }

  /** The current text of a target (as saved: without internal attributes), `null` if gone. */
  source(t: SourceTarget): string | null {
    const doc = this.store()?.document();
    if (!doc) return null;
    if (t.kind === 'asset') {
      const svg = doc.asset(t.asset)?.svg;
      return svg ? serializeAsset(svg) : null;
    }
    const el = doc.node(t.ref);
    return el ? serializeElement(el) : null;
  }

  /** A short name for the dialog: `<rect id="a">` or the asset file. */
  title(t: SourceTarget): string {
    if (t.kind === 'asset') return T.editSubtitleAsset(t.asset);
    const el = this.store()?.document().node(t.ref);
    const id = el?.getAttribute('id');
    return T.editSubtitleNode(el ? `<${el.localName}${id ? ` id="${id}"` : ''}>` : '');
  }

  openDialog(): void {
    const t = this.target();
    if (!t) return;
    this.editing.set(t);
    this.dialogs.show('svgSource');
  }

  /** Applies edited text as one undo step "Edit SVG Code"; the selection follows (E6). */
  apply(t: SourceTarget, text: string): ApplyResult {
    const s = this.store();
    if (!s) return 'failed';
    if (checkSource(text, t.kind satisfies SourceKind)) return 'invalid';
    const doc = s.document();
    const assetName = t.kind === 'asset' ? t.asset : t.ref.asset;
    const oldRoot = doc.asset(assetName)?.svg?.root ?? null;
    const selected = s.selection();
    const cmd: DocCommand =
      t.kind === 'asset' ? new ReplaceAssetMarkup(assetName, text) : new ReplaceNode(t.ref, text);
    if (!this.run(s, cmd)) return 'failed';
    if (cmd instanceof ReplaceNode) {
      const ref = cmd.newRef;
      const old = cmd.ref;
      const rest = selected.filter((r) => r.asset !== old.asset || r.id !== old.id);
      if (ref) s.select([...rest, ref]);
    } else if (selected.length && oldRoot) {
      const newRoot = doc.asset(assetName)?.svg?.root;
      const inAsset = selected.filter((r) => r.asset === assetName);
      const els = inAsset
        .map((r) =>
          oldRoot.getAttribute(ID_ATTR) === r.id
            ? oldRoot
            : oldRoot.querySelector(`[${ID_ATTR}="${r.id}"]`),
        )
        .filter((e): e is Element => !!e);
      const mapped = newRoot ? mapSelection(oldRoot, newRoot, els) : [];
      const refs = mapped.map((el) => doc.refOf(el)).filter((r): r is NodeRef => !!r);
      s.select([...selected.filter((r) => r.asset !== assetName), ...refs]);
    }
    return 'ok';
  }

  private run(s: DocumentStore, cmd: DocCommand): boolean {
    try {
      s.execute(cmd);
      return true;
    } catch (e) {
      if (e instanceof CommandError) return false;
      throw e;
    }
  }

  /** `edit.editSvg { markup }` (AI, design 011 E13): straight to the target, errors as notice. */
  applyToSelection(text: string): boolean {
    const t = this.target();
    const result = t ? this.apply(t, text) : 'failed';
    if (result !== 'ok') this.files.notice.set(T.applyFailed);
    return result === 'ok';
  }

  // ---- optimize path (E12) ----

  /** Every `<path>` of the selection: selected paths, paths in selected nodes / layers / groups. */
  optimizeTargets(): Element[] {
    const s = this.store();
    if (!s) return [];
    const doc = s.document();
    const roots: Element[] = s
      .selection()
      .map((r) => doc.node(r))
      .filter((e): e is Element => !!e);
    if (!roots.length) {
      for (const item of s.items()) {
        const gs = groups(doc.iconJson);
        const list = item.kind === 'root' ? gs : [gs[item.group]];
        for (const g of list) {
          layers(g).forEach((l, i) => {
            if (item.kind === 'layer' && i !== item.layer) return;
            const name = l['image-name'];
            const root = typeof name === 'string' ? doc.asset(name)?.svg?.root : undefined;
            if (root) roots.push(root);
          });
        }
      }
    }
    const out = new Set<Element>();
    for (const r of roots) {
      if (r.localName === 'path') out.add(r);
      for (const p of Array.from(r.querySelectorAll('path'))) out.add(p);
    }
    return [...out];
  }

  private optimizeChanges(opts: OptimizeOptions): {
    changes: AttributeChange[];
    stats: OptimizeStats;
  } {
    const doc = this.store()?.document();
    const stats: OptimizeStats = {
      paths: 0,
      changed: 0,
      pointsBefore: 0,
      pointsAfter: 0,
      charsBefore: 0,
      charsAfter: 0,
    };
    const changes: AttributeChange[] = [];
    if (!doc) return { changes, stats };
    for (const el of this.optimizeTargets()) {
      const d = el.getAttribute('d');
      const ref = doc.refOf(el);
      const r = d === null ? null : optimizePath(d, opts);
      if (!r || !ref || d === null) continue;
      stats.paths++;
      stats.pointsBefore += r.pointsBefore;
      stats.pointsAfter += r.pointsAfter;
      stats.charsBefore += d.length;
      stats.charsAfter += r.d.length;
      if (r.d !== d) {
        stats.changed++;
        changes.push({ ref, name: 'd', value: r.d });
      }
    }
    return { changes, stats };
  }

  /** Points / characters before and after (the preview of the dialog). */
  optimizeStats(opts: OptimizeOptions): OptimizeStats {
    return this.optimizeChanges(opts).stats;
  }

  /** One `setAttributes` "Optimize Path" for the paths that change; `null` if none does. */
  optimizeCommand(opts: OptimizeOptions): SetAttributes | null {
    const { changes } = this.optimizeChanges(opts);
    return changes.length ? new SetAttributes(changes.slice(0, MAX_CHANGES), 'optimizePath') : null;
  }

  canOptimize(): boolean {
    return this.optimizeTargets().some((el) => el.hasAttribute('d'));
  }

  /** Runs the optimizer on the selection; `false` if nothing changed. */
  optimize(opts: OptimizeOptions): boolean {
    const s = this.store();
    const cmd = this.optimizeCommand(opts);
    return !!s && !!cmd && this.run(s, cmd);
  }

  openOptimizeDialog(): void {
    if (this.canOptimize()) this.dialogs.show('optimizePath');
  }
}
