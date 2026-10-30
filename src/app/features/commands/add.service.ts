import { inject, Injectable } from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { IconFileApi } from '../../core/icon-file/icon-file-api';
import { ImageFileDto } from '../../core/icon-file/icon-file.models';
import { DialogService } from '../../shared/dialog/dialog.service';
import { Point } from '../../shared/geometry/view-transform';
import { CanvasEditStore } from '../canvas/canvas-edit.store';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { CommandError, CompositeCommand, InsertNode } from '../document/commands';
import { DocumentStore } from '../document/document.store';
import { NodeRef } from '../document/icon-document';
import { isDefinitionTag } from '../document/model/reorder-rules';
import { collectIds } from '../document/svg/svg-references';
import { SVG_NS } from '../document/svg/node-ids';
import { StyleMemory } from '../sketch/style-memory';
import { ConstructionMode } from '../construction/construction-mode';
import { UndoLabel } from '../document/undo/undo-texts';
import { FilesService } from '../files/files.service';
import { EditService } from '../hierarchy/edit.service';
import { applyShapeArgs, parseRef } from './add-args';
import { COMMANDS_TEXTS as T } from './commands-texts';
import {
  buildElement,
  defaultShape,
  ElementSpec,
  fitImage,
  imageSpec,
  ShapeKind,
} from './element-defaults';
import { iconGroupPlan, layerPlan } from './icon-group';
import { isImageDataUrl, svgDataUrlSize } from './image-size';
import { localMatrix, toLocal, visibleCenter } from './insert-center';
import { Matrix } from '../../shared/geometry/matrix';
import { InsertTarget, insertTarget } from './insert-target';
import { measureInDom, SnippetError, snippetElements, snippetMarkups } from './svg-snippet';
import { ClipEditStore } from '../clip/clip-edit.store';
import { clipSpaceToDocument } from '../../shared/geometry/clip-geometry';
import { parseFragment } from '../document/svg/node-ids';

/** Shapes whose paint is remembered when they are added (design 019 E13; not freehand, text …). */
const REMEMBERED: ReadonlySet<UndoLabel> = new Set<UndoLabel>([
  'addCircle',
  'addEllipse',
  'addRect',
  'addPath',
  'addLine',
  'addPolyline',
  'addPolygon',
  'addArc',
]);

/** Undo label of each shape (design 008 E1). */
const LABELS: Record<ShapeKind, UndoLabel> = {
  container: 'addContainer',
  circle: 'addCircle',
  ellipse: 'addEllipse',
  rect: 'addRect',
  path: 'addPath',
  line: 'addLine',
  polyline: 'addPolyline',
  polygon: 'addPolygon',
  text: 'addText',
};

type Args = Record<string, unknown> | undefined;

/** Where and around which point (target's user space) a new element goes. */
interface Place {
  target: InsertTarget;
  center: Point;
  /** A document point in the user space of the target's parent (design 008 E3). */
  local: (p: Point) => Point;
  /** The same as a matrix, `null` = none (design 019 E11). */
  matrix: Matrix | null;
  /** Put in front of every new element's `transform` (a bounding-box clip, design 014 E7). */
  transform?: string;
}

/** `markup` (one element) with `transform` in front of its own. */
function withTransform(markup: string, transform: string): string {
  const el = parseFragment(markup);
  if (!el) return markup;
  const own = el.getAttribute('transform');
  el.setAttribute('transform', own ? `${transform} ${own}` : transform);
  return new XMLSerializer().serializeToString(el);
}

/**
 * Builds the markup of what is added around `center` (`local` maps document points, `toLocal` is
 * that map as a matrix or `null` for none).
 */
export type BuildMarkup = (
  center: Point,
  local: (p: Point) => Point,
  toLocal: Matrix | null,
) => string[] | null;

/** The namespace declarations the asset root already makes (content of a new asset). */
function withoutNs(markup: string): string {
  return markup
    .replace(` xmlns="${SVG_NS}"`, '')
    .replace(' xmlns:xlink="http://www.w3.org/1999/xlink"', '');
}

/** `centerX` / `centerY` of the arguments: the centre in document coordinates (design 071 E3). */
function argCenter(args: Args): Point | null {
  const x = args?.['centerX'];
  const y = args?.['centerY'];
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)
    ? { x, y }
    : null;
}

/**
 * The "Add" functions of the window (design 008): builds the markup with the defaults (or the
 * caller's arguments), finds the place (`insert-target.ts`) and the centre (`insert-center.ts`),
 * runs ONE composite command through the `DocumentStore` and selects what was added (E7). Root
 * service like `EditService` (one document per window).
 */
@Injectable({ providedIn: 'root' })
export class AddService {
  private readonly files = inject(FilesService);
  private readonly edit = inject(EditService);
  private readonly canvas = inject(CanvasViewStore);
  private readonly canvasEdit = inject(CanvasEditStore);
  private readonly api = inject(IconFileApi);
  private readonly dialogs = inject(DialogService);
  private readonly clipEdit = inject(ClipEditStore);
  private readonly memory = inject(StyleMemory);
  private readonly construction = inject(ConstructionMode);

  constructor() {
    // a pasted image is added like "Add › Image" (design 071 E5)
    this.edit.imagePaster = (image) => this.addImageFile(image);
  }

  /** Adding works when no file action is running. */
  canAdd(): boolean {
    return !this.files.busy();
  }

  /** The window's document; without one a new document is made first (design 008 E2). */
  private async ensureStore(): Promise<DocumentStore | null> {
    if (!this.files.store()) await this.files.newDocument();
    return this.files.store();
  }

  /** The place from the arguments (`parent`, `index`) or the rules; `null` = invalid arguments. */
  private place(store: DocumentStore, args: Args): Place | null {
    const doc = store.document();
    const parent = parseRef(args?.['parent']);
    if (parent === null) return null;
    let target: InsertTarget;
    if (parent) {
      const el = doc.node(parent);
      if (!el) return null;
      const index = args?.['index'];
      target = {
        kind: 'node',
        parent,
        index: typeof index === 'number' ? index : el.children.length,
      };
    } else if (this.clipEdit.scope(doc)) {
      return this.clipPlace(doc.refOf(this.clipEdit.scope(doc)!)!, this.clipEdit.scope(doc)!, args);
    } else {
      target = insertTarget(doc, this.edit.selection(), this.canvasEdit.context());
    }
    const docCenter = argCenter(args) ?? visibleCenter(this.canvas.view(), this.canvas.viewport());
    const parentEl = target.kind === 'node' ? doc.node(target.parent) : null;
    const host = this.canvas.host;
    return {
      target,
      center: toLocal(host, parentEl, docCenter),
      local: (p) => toLocal(host, parentEl, p),
      matrix: localMatrix(host, parentEl),
    };
  }

  /**
   * The clip path edit mode (design 014 E7): new shapes go into the clip, around the visible centre
   * in clip space. In bounding-box units the defaults are document sized: a `transform` maps them.
   */
  private clipPlace(ref: NodeRef, clip: Element, args: Args): Place {
    const docCenter = argCenter(args) ?? visibleCenter(this.canvas.view(), this.canvas.viewport());
    const target: InsertTarget = { kind: 'node', parent: ref, index: clip.children.length };
    const host = this.canvas.host;
    const m = host ? clipSpaceToDocument(host, clip) : null;
    if (!m || Math.abs(m.a * m.d - m.b * m.c) < 1e-12)
      return { target, center: docCenter, local: (p) => p, matrix: null };
    const inv = m.inverse();
    const local = (p: Point) => {
      const q = new DOMPoint(p.x, p.y).matrixTransform(inv);
      return { x: q.x, y: q.y };
    };
    if (clip.getAttribute('clipPathUnits')?.trim() !== 'objectBoundingBox') {
      const mat = { a: inv.a, b: inv.b, c: inv.c, d: inv.d, e: inv.e, f: inv.f };
      return { target, center: local(docCenter), local, matrix: mat };
    }
    const t = `matrix(${[inv.a, inv.b, inv.c, inv.d, inv.e, inv.f].map((v) => Number(v.toPrecision(10))).join(' ')})`;
    return { target, center: docCenter, local: (p) => p, matrix: null, transform: t };
  }

  /** Runs the insertion of `markups` at `place` as one step; selects the new nodes. */
  private insert(store: DocumentStore, label: UndoLabel, place: Place, markups: string[]): boolean {
    const doc = store.document();
    try {
      if (place.target.kind === 'node') {
        const { parent, index } = place.target;
        const t = place.transform;
        const inserts = markups.map(
          (m, k) => new InsertNode(parent, t ? withTransform(m, t) : m, index + k, label),
        );
        store.execute(new CompositeCommand(label, inserts));
        const refs = inserts.flatMap((i) => (i.ref ? [i.ref] : []));
        this.selectPainted(store, refs);
        if (REMEMBERED.has(label)) this.memory.recordRefs(store.document(), refs);
      } else {
        const content = markups.map((m) => withoutNs(m) + '\n').join('');
        const plan = iconGroupPlan(doc, this.edit.selection(), label, content);
        store.execute(plan.command);
        const root = store.document().assets.get(plan.asset)?.svg?.root;
        const refs = Array.from(root?.children ?? []).flatMap((e) => {
          const r = store.document().refOf(e);
          return r ? [r] : [];
        });
        this.selectPainted(store, refs);
        if (REMEMBERED.has(label)) this.memory.recordRefs(store.document(), refs);
      }
      return true;
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      this.files.notice.set(T.addFailed);
      return false;
    }
  }

  /** Selects the new nodes that paint (a snippet's `defs` are not selected), else all. */
  private selectPainted(store: DocumentStore, refs: NodeRef[]): void {
    const doc = store.document();
    const painted = refs.filter((r) => {
      const el = doc.node(r);
      return el && !isDefinitionTag(el);
    });
    store.select(painted.length ? painted : refs);
  }

  /**
   * Inserts what `build` makes at the place from the arguments or the rules, as one undo step
   * labelled `label`, and selects it – the way of every "Add" function, also of the tools (013).
   */
  async insertBuilt(label: UndoLabel, args: Args, build: BuildMarkup): Promise<boolean> {
    const store = await this.ensureStore();
    if (!store) return false;
    const place = this.place(store, args);
    const built = place ? build(place.center, place.local, place.matrix) : null;
    const markups = built ? this.construction.apply(label, built) : null;
    if (!place || !markups?.length) {
      this.files.notice.set(T.addFailed);
      return false;
    }
    return this.insert(store, label, place, markups);
  }

  /** Container, circle … text (design 008 E5/E6). */
  addShape(kind: ShapeKind, args?: Args): Promise<boolean> {
    const paint = kind === 'container' || kind === 'text' ? undefined : this.memory.attrs(kind);
    return this.insertBuilt(LABELS[kind], args, (c) => {
      const spec = applyShapeArgs(kind, defaultShape(kind, c, paint), args);
      return spec ? [buildElement(spec)] : null;
    });
  }

  /** A new icon group with layer and asset; the new layer is selected (design 008 E4). */
  async addIconGroup(): Promise<boolean> {
    const store = await this.ensureStore();
    if (!store) return false;
    const plan = iconGroupPlan(store.document(), this.edit.selection());
    try {
      store.execute(plan.command);
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      this.files.notice.set(T.addFailed);
      return false;
    }
    store.selectItems([{ kind: 'layer', group: plan.group, layer: 0 }]);
    return true;
  }

  /** A new layer in the current group, selected (prompt 072 E4); without a group a new one. */
  async addLayer(): Promise<boolean> {
    const store = await this.ensureStore();
    if (!store) return false;
    const plan = layerPlan(store.document(), this.edit.selection());
    if (!plan) return this.addIconGroup();
    try {
      store.execute(plan.command);
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      this.files.notice.set(T.addFailed);
      return false;
    }
    store.selectItems([{ kind: 'layer', group: plan.group, layer: plan.layer }]);
    return true;
  }

  /**
   * An image (design 008 E8): `href` from the caller (data URL only) or from the file dialog;
   * natural size, made smaller to at most 512, centred.
   */
  async addImage(args?: Args): Promise<boolean> {
    const href = typeof args?.['href'] === 'string' ? args['href'] : null;
    if (href !== null) {
      if (!isImageDataUrl(href)) {
        this.files.notice.set(T.imageFailed);
        return false;
      }
      return this.placeImage(href, svgDataUrlSize(href), args);
    }
    try {
      const path = await this.api.pickImageFile();
      if (!path) return false;
      return this.addImageFile(await this.api.readImageFile(path), args);
    } catch (e) {
      this.files.notice.set(`${T.imageFailed} ${describeFsError(toFsError(e))}`);
      return false;
    }
  }

  /** An image file read by the backend (dialog, dropped file, clipboard – design 071). */
  addImageFile(file: ImageFileDto, args?: Args): Promise<boolean> {
    const natural =
      file.width && file.height
        ? { width: file.width, height: file.height }
        : svgDataUrlSize(file.dataUrl);
    return this.placeImage(file.dataUrl, natural, args);
  }

  private placeImage(
    url: string,
    natural: { width: number; height: number } | null,
    args?: Args,
  ): Promise<boolean> {
    const fitted = fitImage(natural?.width ?? 0, natural?.height ?? 0);
    const num = (k: string) => (typeof args?.[k] === 'number' ? (args[k] as number) : undefined);
    const w = num('width') ?? fitted.width;
    const h = num('height') ?? fitted.height;
    return this.insertBuilt('addImage', args, (c) => {
      const spec: ElementSpec = imageSpec(url, c, w, h);
      const x = num('x');
      const y = num('y');
      if (x !== undefined) spec.attrs['x'] = String(x);
      if (y !== undefined) spec.attrs['y'] = String(y);
      return [buildElement(spec)];
    });
  }

  /** Tells the user why a snippet from an action was not added (status line). */
  report(error: SnippetError | 'failed'): void {
    this.files.notice.set(error === 'failed' ? T.addFailed : T.snippetErrors[error]);
  }

  /** "SVG Snippet…" without markup: the dialog asks for it. */
  openSnippetDialog(): void {
    this.dialogs.show('svgSnippet');
  }

  /** Appends the elements of `markup`, centred (design 008 E9); the error if there are none. */
  async addSnippet(markup: string, args?: Args): Promise<SnippetError | 'failed' | null> {
    const parsed = snippetElements(markup);
    if ('error' in parsed) return parsed.error;
    const store = await this.ensureStore();
    if (!store) return 'failed';
    const place = this.place(store, args);
    if (!place) return 'failed';
    const doc = store.document();
    const asset = place.target.kind === 'node' ? place.target.parent.asset : null;
    const root = asset ? doc.assets.get(asset)?.svg?.root : null;
    const taken = root ? collectIds(root) : new Set<string>();
    const markups = snippetMarkups(parsed.elements, taken, place.center, measureInDom);
    return this.insert(store, 'addSvgSnippet', place, markups) ? null : 'failed';
  }
}
