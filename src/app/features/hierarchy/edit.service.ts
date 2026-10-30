import { inject, Injectable } from '@angular/core';
import { ClipboardApi, imageFromBlob } from '../../core/clipboard/clipboard-api';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { ImageFileDto } from '../../core/icon-file/icon-file.models';
import { AskService } from '../../shared/ask/ask.service';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { CommandError, CompositeCommand, DocCommand, ReorderNode } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { IconDocument } from '../document/icon-document';
import { groups, layers } from '../document/model/icon-json';
import { DropPosition, IconItem, TreeTarget } from '../document/model/selection';
import { parseFragment, serializeAsset, serializeElement, SvgText } from '../document/svg/node-ids';
import { clipDefsMarkup } from '../clip/clip-references';
import { formatElement, formatSvg } from '../document/svg/svg-format';
import { brokenReferences } from '../document/svg/svg-references';
import { FilesService } from '../files/files.service';
import {
  backCommand,
  frontCommand,
  groupCommand,
  MoveDirection,
  moveCommand,
  ungroupCommand,
} from './arrange-operations';
import {
  deletableNodes,
  deleteCommand,
  duplicateCommand,
  Planned,
  usedClipsToDelete,
} from './edit-operations';
import { CLIP_TEXTS as CT } from '../clip/clip-texts';
import { usersOutside } from '../document/commands/clip-commands';
import { EMPTY_SELECTION, followUpSelection, Selection } from './follow-up';
import { HIERARCHY_TEXTS as T } from './hierarchy-texts';
import { buildTree, nodeLabelOf } from './hierarchy-model';
import { parseClipboard, pasteCommand } from './paste';
import { visibilityCommand } from './visibility';
import { destinationAsset, findItem, itemObject, selectAllOf } from './edit-items';

/**
 * Editing the selection of the window's document (design 006 E8–E13): the functions behind the
 * edit / arrange actions (`edit-actions.ts`), drag & drop and the eye buttons of the tree. Builds
 * commands with the pure helpers and runs them through the `DocumentStore`; sets the selection
 * that follows. Root service like the `FilesService` (one document per window).
 */
@Injectable({ providedIn: 'root' })
export class EditService {
  private readonly files = inject(FilesService);
  private readonly clipboard = inject(ClipboardApi);
  private readonly ask = inject(AskService);
  private readonly canvas = inject(CanvasViewStore);

  store(): DocumentStore | null {
    return this.files.store();
  }

  selection(): Selection {
    const s = this.store();
    return s ? { nodes: [...s.selection()], items: [...s.items()] } : EMPTY_SELECTION;
  }

  hasSelection(): boolean {
    const s = this.selection();
    return s.nodes.length > 0 || s.items.length > 0;
  }

  select(sel: Selection): void {
    const s = this.store();
    if (!s) return;
    if (sel.nodes.length) s.select(sel.nodes);
    else s.selectItems(sel.items);
  }

  /** Runs a command; `false` if it was refused (nothing changed). */
  private run(cmd: DocCommand | null, after?: () => Selection): boolean {
    const s = this.store();
    if (!s || !cmd) return false;
    try {
      s.execute(cmd);
    } catch (e) {
      if (e instanceof CommandError) return false;
      throw e;
    }
    if (after) this.select(after());
    return true;
  }

  private runPlanned(p: Planned | null): boolean {
    return p ? this.run(p.command, () => p.selection()) : false;
  }

  // ---- delete, duplicate, clipboard ----

  canDelete(): boolean {
    const s = this.store();
    return !!s && !!deleteCommand(s.document(), this.selection());
  }

  /** Delete (with follow-up selection, design 006 E9); `confirm` asks first ("Delete…"). */
  async delete(confirm?: boolean, label?: 'cut'): Promise<boolean> {
    const s = this.store();
    if (!s) return false;
    const sel = this.selection();
    const doc = s.document();
    const cmd = deleteCommand(doc, sel);
    if (!cmd) return false;
    // a clip path that something uses: always asked, unless `confirm: false` (design 014 E10)
    const clips = sel.nodes.length ? usedClipsToDelete(doc, sel.nodes) : [];
    if (clips.length && confirm !== false) {
      if (!(await this.confirmClipDelete(doc, clips))) return false;
    } else if (confirm && !(await this.confirmDelete(sel))) return false;
    const next = followUpSelection(buildTree(doc), sel.nodes, sel.items);
    return this.run(label ? new CompositeCommand(label, [cmd]) : cmd, () => next);
  }

  private async confirmClipDelete(doc: IconDocument, clips: Element[]): Promise<boolean> {
    const one = clips.length === 1 ? clips[0] : null;
    const root = one ? doc.asset(doc.refOf(one)!.asset)!.svg!.root : null;
    const answer = await this.ask.ask({
      title: CT.deleteTitle(one?.getAttribute('id') ?? `${clips.length}`),
      message:
        one && root
          ? CT.deleteMessage(usersOutside(root, one).length)
          : CT.deleteMany(clips.length),
      buttons: [
        { id: 'cancel', label: CT.cancelButton },
        { id: 'delete', label: CT.deleteButton, primary: true },
      ],
      cancel: 'cancel',
    });
    return answer === 'delete';
  }

  private async confirmDelete(sel: Selection): Promise<boolean> {
    const s = this.store()!;
    const count = sel.nodes.length || sel.items.length;
    const name = count === 1 ? nodeLabelOf(buildTree(s.document()), sel) : '';
    const answer = await this.ask.ask({
      title: count === 1 ? T.deleteTitle(name) : T.deleteTitle(`${count}`),
      message: count === 1 ? T.deleteMessage : T.deleteMessageMany(count),
      buttons: [
        { id: 'cancel', label: T.cancelButton },
        { id: 'delete', label: T.deleteButton, primary: true },
      ],
      cancel: 'cancel',
    });
    return answer === 'delete';
  }

  duplicate(): boolean {
    const s = this.store();
    return !!s && this.runPlanned(duplicateCommand(s.document(), this.selection()));
  }

  /** What Copy takes: nodes, or the SVG of a selected layer / a group's first layer. */
  private copySource(): { els: Element[] } | { svg: SvgText } | null {
    const s = this.store();
    if (!s) return null;
    const doc = s.document();
    const sel = this.selection();
    if (sel.nodes.length) {
      const els = deletableNodes(doc, sel.nodes);
      return els.length ? { els } : null;
    }
    const item = sel.items.find((i) => i.kind !== 'root');
    if (!item) return null;
    const g = groups(doc.iconJson)[item.group];
    const l = layers(g)[item.kind === 'layer' ? item.layer : 0];
    const name = l?.['image-name'];
    const svg = typeof name === 'string' ? doc.asset(name)?.svg : undefined;
    return svg ? { svg } : null;
  }

  canCopy(): boolean {
    return this.copySource() !== null;
  }

  /**
   * The selection as SVG markup (design 006 E12), `null` if there is nothing to copy.
   * `formatted`: through the formatter ("Copy XML", design 011 E9); else the text as it is.
   */
  copyText(formatted = false): string | null {
    const src = this.copySource();
    if (!src) return null;
    if ('els' in src) {
      // clips the nodes refer to from outside go along as <defs> (design 014 E10)
      const doc = this.store()!.document();
      const root = doc.asset(doc.refOf(src.els[0])!.asset)!.svg!.root;
      const defs = clipDefsMarkup(src.els, root, serializeElement);
      const extra = defs ? parseFragment(defs) : null;
      const els = extra ? [...src.els, extra] : src.els;
      return formatted
        ? els.map((e) => formatElement(e)).join('')
        : els.map((e) => serializeElement(e)).join('\n');
    }
    const text = serializeAsset(src.svg);
    return formatted ? (formatSvg(text) ?? text) : text;
  }

  /** "Copy XML": the formatted markup (design 011 E9). */
  copyXml(): Promise<boolean> {
    return this.copy(true);
  }

  async copy(formatted = false): Promise<boolean> {
    const text = this.copyText(formatted);
    if (text === null) return false;
    try {
      await this.clipboard.writeText(text);
      return true;
    } catch {
      this.files.notice.set(T.clipboardFailed);
      return false;
    }
  }

  async cut(): Promise<boolean> {
    return (await this.copy()) && this.delete(undefined, 'cut');
  }

  /**
   * Inserts a pasted image (design 071 E5) – set by `AddService` ("Add › Image"), which depends on
   * this service; without it only markup is pasted.
   */
  imagePaster: ((image: ImageFileDto) => Promise<boolean>) | null = null;

  /**
   * Paste markup (`text`) or the clipboard's (design 006 E12). Without SVG markup an image is
   * pasted (design 071 E5): `image` from a paste event, else the clipboard's (`readImage`) – but
   * only when no `text` was given by a caller (the AI pastes markup only).
   */
  async paste(text?: string, image?: Blob | null): Promise<boolean> {
    const allowImage = text === undefined || image !== undefined;
    let t = text;
    let failed = false;
    if (t === undefined) {
      try {
        t = await this.clipboard.readText();
      } catch {
        failed = true;
        t = '';
      }
    }
    const s = this.store();
    if (s && parseClipboard(t)) {
      const ok = this.runPlanned(pasteCommand(s.document(), t, this.selection()));
      if (!ok) this.files.notice.set(T.pasteFailed);
      return ok;
    }
    const paster = this.imagePaster;
    if (allowImage && paster) {
      try {
        const img = image ? await imageFromBlob(image) : await this.clipboard.readImage();
        if (img) return paster(img);
      } catch (e) {
        const err = toFsError(e);
        this.files.notice.set(
          err.code === 'too_large' || err.code === 'invalid_image'
            ? `${T.imagePasteFailed} ${describeFsError(err)}`
            : T.clipboardFailed,
        );
        return false;
      }
    }
    if (!s) return false;
    this.files.notice.set(failed ? T.clipboardFailed : T.pasteFailed);
    return false;
  }

  // ---- arrange ----

  front(): boolean {
    const s = this.store();
    return !!s && this.keep(frontCommand(s.document(), this.selection()));
  }

  back(): boolean {
    const s = this.store();
    return !!s && this.keep(backCommand(s.document(), this.selection()));
  }

  canStack(where: 'front' | 'back'): boolean {
    const s = this.store();
    if (!s) return false;
    const f = where === 'front' ? frontCommand : backCommand;
    return f(s.document(), this.selection()) !== null;
  }

  /** Runs a command that keeps the nodes (refs stay) – groups/layers get their new places. */
  private keep(cmd: DocCommand | null): boolean {
    if (!cmd) return false;
    const sel = this.selection();
    if (sel.nodes.length) return this.run(cmd);
    // groups / layers: recompute their indices from the moved objects
    const s = this.store()!;
    const json = s.document().iconJson;
    const objs = sel.items.map((i) => itemObject(json, i));
    return this.run(cmd, () => ({
      nodes: [],
      items: objs.flatMap((o) => (o ? findItem(s.document().iconJson, o) : [])),
    }));
  }

  moveCommand(dir: MoveDirection): ReorderNode | null {
    const s = this.store();
    return s ? moveCommand(s.document(), this.selection(), dir) : null;
  }

  move(dir: MoveDirection): boolean {
    return this.applyReorder(this.moveCommand(dir));
  }

  /** "Reorder Node" from drag & drop (design 006 E6/E7); reports broken references. */
  reorder(sources: TreeTarget[], target: TreeTarget, position: DropPosition): boolean {
    return this.applyReorder(new ReorderNode(sources, target, position));
  }

  private applyReorder(cmd: ReorderNode | null): boolean {
    const s = this.store();
    if (!s || !cmd) return false;
    const refs = cmd.sources.flatMap((t) => (t.kind === 'node' ? [t.ref] : []));
    const dest = destinationAsset(s, cmd.target, cmd.position);
    const broken = dest ? brokenReferences(s.document(), refs, dest) : [];
    const ok = this.run(cmd, () => ({
      nodes: cmd.moved.flatMap((m) => (m.kind === 'node' ? [m.ref] : [])),
      items: cmd.moved.flatMap((m): IconItem[] => (m.kind === 'node' ? [] : [m])),
    }));
    if (ok && broken.length) this.files.notice.set(T.brokenRefs(broken));
    return ok;
  }

  group(): boolean {
    const s = this.store();
    return !!s && this.runPlanned(groupCommand(s.document(), this.selection()));
  }

  canGroup(): boolean {
    const s = this.store();
    return !!s && groupCommand(s.document(), this.selection()) !== null;
  }

  ungroup(): boolean {
    const s = this.store();
    return !!s && this.runPlanned(ungroupCommand(s.document(), this.selection()));
  }

  canUngroup(): boolean {
    const s = this.store();
    return !!s && ungroupCommand(s.document(), this.selection()) !== null;
  }

  // ---- visibility, select all ----

  toggleVisibility(sel: Selection = this.selection(), recursive = false): boolean {
    const s = this.store();
    return !!s && this.run(visibilityCommand(s.document(), sel, recursive));
  }

  canToggleVisibility(): boolean {
    const s = this.store();
    return !!s && visibilityCommand(s.document(), this.selection()) !== null;
  }

  /** Select All: every group / layer if those are selected, else the painted nodes of every layer. */
  selectAll(): void {
    const s = this.store();
    if (!s) return;
    const all = selectAllOf(s.document(), s.items());
    if ('items' in all) s.selectItems(all.items);
    else s.select(all.nodes);
  }
}
