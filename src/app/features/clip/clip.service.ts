import { inject, Injectable } from '@angular/core';
import { AskService } from '../../shared/ask/ask.service';
import { fmt } from '../../shared/geometry/align';
import {
  AssignClip,
  AttributeChange,
  CommandError,
  CompositeCommand,
  DocCommand,
  InsertDefinition,
  RemoveClipPath,
  SetAttributes,
  SetLayerClip,
  usersOutside,
} from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { NodeRef } from '../document/icon-document';
import {
  canvasRect,
  ClipRect,
  clipOwner,
  findClipPath,
  uniqueClipId,
} from '../document/model/clip-model';
import { ClipUnits, clipUnitsOf, convertUnitsTransform } from '../document/model/clip-units';
import { parseFragment } from '../document/svg/node-ids';
import { collectIds } from '../document/svg/svg-references';
import { parseRef } from '../commands/add-args';
import { FilesService } from '../files/files.service';
import { ClipEditStore } from './clip-edit.store';
import { ClipPanel, clipPanel, ClipTarget, clipTargetOf, layerTarget } from './clip-panel-model';
import { CLIP_TEXTS as T } from './clip-texts';

/** Arguments of the clip actions (design 014 E14; schema in `core/actions/clip-action-args.ts`). */
export interface ClipArgs {
  node?: unknown;
  layer?: unknown;
  clip?: string;
  asset?: string;
  mode?: 'none' | 'inherit';
  shape?: 'rect' | 'circle' | 'ellipse';
  markup?: string;
  id?: string;
  units?: ClipUnits;
  confirm?: boolean;
}

const ID = /^[A-Za-z_][\w.-]*$/;

/** The start shape of a new clip in `r` (E6). */
export function clipShapeMarkup(r: ClipRect, shape: ClipArgs['shape'] = 'rect'): string {
  const cx = fmt(r.x + r.width / 2);
  const cy = fmt(r.y + r.height / 2);
  if (shape === 'circle')
    return `<circle cx="${cx}" cy="${cy}" r="${fmt(Math.min(r.width, r.height) / 2)}"/>`;
  if (shape === 'ellipse') {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${fmt(r.width / 2)}" ry="${fmt(r.height / 2)}"/>`;
  }
  return `<rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.width)}" height="${fmt(r.height)}"/>`;
}

/** The local bounding box of a node (its `userSpaceOnUse` space), `null` without layout. */
function bboxOf(el: Element): ClipRect | null {
  try {
    const b = (el as SVGGraphicsElement).getBBox?.();
    return b && b.width > 0 && b.height > 0
      ? { x: b.x, y: b.y, width: b.width, height: b.height }
      : null;
  } catch {
    return null;
  }
}

/**
 * The clip path functions of the window (design 014 E5–E14): create, assign, edit mode, remove,
 * units – from the "Clip Path" section, the menu and the AI (`clip.*` actions with arguments).
 * Builds serialisable commands and runs them through the `DocumentStore`. Root service like the
 * `EditService` (one document per window).
 */
@Injectable({ providedIn: 'root' })
export class ClipService {
  private readonly files = inject(FilesService);
  private readonly ask = inject(AskService);
  readonly editing = inject(ClipEditStore);

  store(): DocumentStore | null {
    return this.files.store();
  }

  /** The section of the current selection, `null` when it has none. */
  panel(): ClipPanel | null {
    const s = this.store();
    if (!s) return null;
    const t = clipTargetOf(s.document(), s.selection(), s.items());
    return t ? clipPanel(s.document(), t) : null;
  }

  /** The target from the arguments (`node` / `layer`), else the selection. */
  target(args?: ClipArgs): ClipTarget | null {
    const s = this.store();
    if (!s) return null;
    const doc = s.document();
    const ref = parseRef(args?.node);
    if (ref === null) return null;
    if (ref) return clipTargetOf(doc, [ref], []);
    const l = args?.layer as { group?: unknown; layer?: unknown } | undefined;
    if (l !== undefined) {
      const ok =
        typeof l === 'object' &&
        l !== null &&
        Number.isInteger(l.group) &&
        Number.isInteger(l.layer);
      return ok ? layerTarget(doc, l.group as number, l.layer as number) : null;
    }
    return clipTargetOf(doc, s.selection(), s.items());
  }

  /** The `<clipPath>` from `clip` + `asset` or the target's clip. */
  private clipRef(args?: ClipArgs): NodeRef | null {
    const s = this.store();
    if (!s) return null;
    const doc = s.document();
    if (args?.clip !== undefined) {
      const t = args.asset === undefined ? this.target(args) : null;
      const asset = args.asset ?? (t ? this.assetOfTarget(t) : null);
      const root = asset ? doc.asset(asset)?.svg?.root : null;
      const el = root ? findClipPath(root, args.clip) : null;
      return el ? doc.refOf(el) : null;
    }
    const t = this.target(args);
    return t ? (clipPanel(doc, t).clip?.ref ?? null) : null;
  }

  private assetOfTarget(t: ClipTarget): string {
    return t.kind === 'layer' ? t.asset : t.ref.asset;
  }

  private run(cmd: DocCommand): boolean {
    const s = this.store();
    if (!s) return false;
    try {
      s.execute(cmd);
      return true;
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      this.files.notice.set(T.failed);
      return false;
    }
  }

  /** A node or layer to clip (from the arguments or the selection). */
  canCreate(args?: ClipArgs): boolean {
    const t = this.target(args);
    return !!t && t.kind !== 'clip';
  }

  /** "Create Clip Path" (E6): a new `<clipPath>` for the node / layer, assigned at once. */
  create(args?: ClipArgs): boolean {
    const t = this.target(args);
    if (!t || t.kind === 'clip') return false;
    const asset = this.assetOfTarget(t);
    const id = args?.id ?? uniqueClipId(t.root);
    if (!ID.test(id) || collectIds(t.root).has(id)) return this.fail();
    let shape: string;
    if (args?.markup !== undefined) {
      if (!parseFragment(args.markup)) return this.fail();
      shape = args.markup;
    } else {
      const rect = (t.kind === 'node' ? bboxOf(t.el) : null) ?? canvasRect(t.root);
      shape = clipShapeMarkup(rect, args?.shape);
    }
    const def = new InsertDefinition(asset, `<clipPath id="${id}">${shape}</clipPath>`);
    const use = t.kind === 'node' ? new AssignClip(t.ref, 'own', id) : new SetLayerClip(asset, id);
    return this.run(new CompositeCommand('createClipPath', [def, use]));
  }

  /** The picker (E4): `mode` none / inherit or a `clip` id – for a node or a layer. */
  assign(args?: ClipArgs): boolean {
    const t = this.target(args);
    if (!t || t.kind === 'clip') return false;
    const clip = args?.clip;
    if (t.kind === 'layer') {
      if (args?.mode === 'inherit') return this.fail();
      return this.run(new SetLayerClip(t.asset, clip ?? null));
    }
    if (clip !== undefined) return this.run(new AssignClip(t.ref, 'own', clip));
    return this.run(new AssignClip(t.ref, args?.mode ?? 'none'));
  }

  /** Picker value `none` / `inherit` / `#id` of the section. */
  choose(value: string): boolean {
    if (value.startsWith('#')) return this.assign({ clip: value.slice(1) });
    return value === 'none' || value === 'inherit' ? this.assign({ mode: value }) : false;
  }

  canEdit(args?: ClipArgs): boolean {
    return this.clipRef(args) !== null;
  }

  /** Enters the edit mode for the clip (E7); its first shape is selected. */
  edit(args?: ClipArgs): boolean {
    const ref = this.clipRef(args);
    const s = this.store();
    const el = ref && s ? s.document().node(ref) : null;
    if (!ref || !s || !el) return false;
    this.editing.enter(ref);
    const first = el.firstElementChild;
    const shape = first ? s.document().refOf(first) : null;
    s.select(shape ? [shape] : []);
    return true;
  }

  done(): boolean {
    return this.editing.exit();
  }

  /** Deletes the clip with its references (E10); asks when something uses it (`confirm: false`: not). */
  async remove(args?: ClipArgs): Promise<boolean> {
    const ref = this.clipRef(args);
    const s = this.store();
    if (!ref || !s) return false;
    const info = clipPanelInfo(s, ref);
    if (info.users > 0 && args?.confirm !== false) {
      const answer = await this.ask.ask({
        title: T.deleteTitle(info.id),
        message: T.deleteMessage(info.users),
        buttons: [
          { id: 'cancel', label: T.cancelButton },
          { id: 'delete', label: T.deleteButton, primary: true },
        ],
        cancel: 'cancel',
      });
      if (answer !== 'delete') return false;
    }
    return this.run(new RemoveClipPath(ref));
  }

  /** `clipPathUnits` with the compensating `transform` for the owner (E8). */
  setUnits(args: ClipArgs): boolean {
    const ref = this.clipRef(args);
    const s = this.store();
    const units = args.units;
    if (!ref || !s || !units) return false;
    const doc = s.document();
    const clip = doc.node(ref)!;
    const root = doc.asset(ref.asset)!.svg!.root;
    const from = clipUnitsOf(clip);
    if (from === units) return false;
    const owner = clipOwner(root, clip);
    let transform: string | null | undefined = clip.getAttribute('transform');
    if (owner) {
      const b = bboxOf(owner);
      transform = b ? convertUnitsTransform(transform, b, from, units) : undefined;
      if (transform === undefined) return this.fail();
    }
    const changes: AttributeChange[] = [
      { ref, name: 'clipPathUnits', value: units },
      { ref, name: 'transform', value: transform },
    ];
    return this.run(new SetAttributes(changes, 'changeClipUnits'));
  }

  private fail(): false {
    this.files.notice.set(T.failed);
    return false;
  }
}

function clipPanelInfo(s: DocumentStore, ref: NodeRef): { id: string; users: number } {
  const doc = s.document();
  const el = doc.node(ref)!;
  const root = doc.asset(ref.asset)!.svg!.root;
  return { id: el.getAttribute('id') ?? '', users: usersOutside(root, el).length };
}
