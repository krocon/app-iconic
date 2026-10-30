import { computed, inject, Injectable } from '@angular/core';
import { CompositeCommand, InsertNode } from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { FilesService } from '../files/files.service';
import { editableRefs } from '../lock/lock';
import {
  cleanEffect,
  defaultEffect,
  Effect,
  EffectKind,
  effectsCommand,
  FilterState,
  filterState,
} from './effect-model';
import {
  createMaskCommand,
  maskBlocker,
  maskOf,
  MaskType,
  maskTypeCommand,
  releaseMaskCommand,
} from './mask-model';
import { EFFECTS_TEXTS as T } from './effects-texts';

/**
 * Effects and masks of the selection (prompt 076): the state of the one selected element, changes
 * as one step (actions, the AI) or as a live gesture of the panel (fields being typed or dragged:
 * `preview` … `commit` = one undo step, `cancel` = none).
 */
@Injectable({ providedIn: 'root' })
export class EffectsService {
  private readonly files = inject(FilesService);

  /** The one editable selected element. */
  readonly target = computed((): NodeRef | null => {
    const s = this.files.store();
    if (!s) return null;
    const refs = editableRefs(s.document(), s.selection());
    return refs.length === 1 ? refs[0] : null;
  });

  readonly state = computed((): FilterState | null => {
    const s = this.files.store();
    const ref = this.target();
    if (!s || !ref) return null;
    s.revision();
    const el = s.document().node(ref);
    const root = s.document().assets.get(ref.asset)?.svg?.root;
    return el && root ? filterState(el, root) : null;
  });

  readonly maskType = computed((): MaskType | null => {
    const s = this.files.store();
    const ref = this.target();
    if (!s || !ref) return null;
    s.revision();
    const el = s.document().node(ref);
    const root = s.document().assets.get(ref.asset)?.svg?.root;
    const mask = el && root ? maskOf(el, root) : null;
    return mask ? ((mask.getAttribute('mask-type') as MaskType) ?? 'luminance') : null;
  });

  effects(): Effect[] {
    const st = this.state();
    return st?.kind === 'managed' ? st.effects : [];
  }

  private ref(node?: unknown): NodeRef | null {
    const r = node as NodeRef | null | undefined;
    return r && typeof r.asset === 'string' && typeof r.id === 'string' ? r : this.target();
  }

  /** The list with `kind` changed by `patch` (added when missing); `null` = removed. */
  withKind(list: readonly Effect[], kind: EffectKind, patch: Partial<Effect> | null): Effect[] {
    const rest = list.filter((e) => e.kind !== kind);
    if (patch === null) return rest;
    const old = list.find((e) => e.kind === kind) ?? defaultEffect(kind);
    const next = cleanEffect({ ...old, ...patch, kind });
    return next ? [...rest, next] : rest;
  }

  /** One step (the actions). */
  set(effects: readonly Effect[], node?: unknown): boolean {
    const s = this.files.store();
    const ref = this.ref(node);
    const cmd = s && ref ? effectsCommand(s.document(), ref, effects) : null;
    if (!s || !cmd) return false;
    s.execute(cmd);
    return true;
  }

  change(kind: EffectKind, patch: Partial<Effect> | null, node?: unknown): boolean {
    const ref = this.ref(node);
    const s = this.files.store();
    if (!s || !ref) return false;
    const el = s.document().node(ref);
    const root = s.document().assets.get(ref.asset)?.svg?.root;
    const st = el && root ? filterState(el, root) : null;
    if (!st || st.kind === 'foreign') return false;
    const list = st.kind === 'managed' ? st.effects : [];
    return this.set(this.withKind(list, kind, patch), ref);
  }

  // ---- live gesture of the panel ----
  private live = false;

  preview(kind: EffectKind, patch: Partial<Effect>): void {
    const s = this.files.store();
    const ref = this.target();
    if (!s || !ref) return;
    if (!this.live) {
      s.begin('changeEffects');
      this.live = true;
    }
    const cmd = effectsCommand(s.document(), ref, this.withKind(this.effects(), kind, patch));
    if (cmd) s.update(cmd);
  }

  commit(): void {
    if (!this.live) return;
    this.live = false;
    this.files.store()?.commit();
  }

  cancel(): void {
    if (!this.live) return;
    this.live = false;
    this.files.store()?.cancel();
  }

  // ---- masks ----

  canCreateMask(): boolean {
    const s = this.files.store();
    return !!s && maskBlocker(s.document(), editableRefs(s.document(), s.selection())) === null;
  }

  createMask(): boolean {
    const s = this.files.store();
    if (!s) return false;
    const cmd = createMaskCommand(s.document(), editableRefs(s.document(), s.selection()));
    if (!cmd) {
      this.files.notice.set(T.maskCount);
      return false;
    }
    s.execute(cmd);
    // the masked group is the new selection
    const group = cmd instanceof CompositeCommand ? cmd.commands[1] : null;
    if (group instanceof InsertNode && group.ref) s.select([group.ref]);
    return true;
  }

  releaseMask(node?: unknown): boolean {
    const s = this.files.store();
    const ref = this.ref(node);
    const cmd = s && ref ? releaseMaskCommand(s.document(), ref) : null;
    if (!s || !cmd) return false;
    s.execute(cmd);
    return true;
  }

  setMaskType(type: MaskType, node?: unknown): boolean {
    const s = this.files.store();
    const ref = this.ref(node);
    const cmd = s && ref ? maskTypeCommand(s.document(), ref, type) : null;
    if (!s || !cmd) return false;
    s.execute(cmd);
    return true;
  }
}
