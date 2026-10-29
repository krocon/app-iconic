import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { AlignMode, DistributeAxis, DistributeKind } from '../../shared/geometry/align';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { DocCommand } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { AlignTo, alignCommand, distributeCommand, measurable } from '../hierarchy/align';

const same = (a: NodeRef, b: NodeRef) => a.asset === b.asset && a.id === b.id;

/**
 * Align and Distribute (design 006 E13, prompt 054): align to the selection's box, the canvas or
 * the key object – the node added to the selection last (Illustrator: the one clicked last) –
 * and distribute centres / gaps, or at a fixed gap. One undo step each.
 */
@Injectable({ providedIn: 'root' })
export class AlignService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);
  /** What align lines up with (per window, like Illustrator's Align To). */
  readonly to = signal<AlignTo>('selection');
  /** The key object: the node added to the selection last. */
  readonly key = signal<NodeRef | null>(null);
  /** The last fixed gap (document units). */
  readonly gap = signal(20);

  constructor() {
    let before: readonly NodeRef[] = [];
    effect(() => {
      const sel = this.files.store()?.selection() ?? [];
      untracked(() => {
        const added = sel.filter((r) => !before.some((b) => same(b, r)));
        const key = this.key();
        if (added.length) this.key.set(added[added.length - 1]);
        else if (key && !sel.some((r) => same(r, key))) this.key.set(sel.at(-1) ?? null);
        before = sel;
      });
    });
  }

  private refs(): readonly NodeRef[] {
    return this.files.store()?.selection() ?? [];
  }

  private count(): number {
    const s = this.files.store();
    return s ? measurable(s.document(), this.view.host, this.refs()).length : 0;
  }

  canAlign(to: AlignTo = this.to()): boolean {
    return this.count() >= (to === 'canvas' ? 1 : 2);
  }

  canDistribute(gap?: number): boolean {
    return this.count() >= (gap === undefined ? 3 : 2);
  }

  private run(cmd: DocCommand | null): boolean {
    const s = this.files.store();
    if (!s || !cmd) return false;
    s.execute(cmd);
    return true;
  }

  align(mode: AlignMode, to: AlignTo = this.to()): boolean {
    const s = this.files.store();
    return (
      !!s && this.run(alignCommand(s.document(), this.view.host, this.refs(), mode, to, this.key()))
    );
  }

  distribute(axis: DistributeAxis, kind: DistributeKind, gap?: number): boolean {
    const s = this.files.store();
    return (
      !!s && this.run(distributeCommand(s.document(), this.view.host, this.refs(), axis, kind, gap))
    );
  }
}
