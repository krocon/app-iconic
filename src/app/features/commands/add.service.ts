import { inject, Injectable } from '@angular/core';
import { describeFsError, toFsError } from '../../core/errors/fs-error';
import { IconFileApi } from '../../core/icon-file/icon-file-api';
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
import { iconGroupPlan } from './icon-group';
import { isImageDataUrl, svgDataUrlSize } from './image-size';
import { toLocal, visibleCenter } from './insert-center';
import { InsertTarget, insertTarget } from './insert-target';
import { measureInDom, SnippetError, snippetElements, snippetMarkups } from './svg-snippet';

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
}

/** The namespace declarations the asset root already makes (content of a new asset). */
function withoutNs(markup: string): string {
  return markup
    .replace(` xmlns="${SVG_NS}"`, '')
    .replace(' xmlns:xlink="http://www.w3.org/1999/xlink"', '');
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
    } else {
      target = insertTarget(doc, this.edit.selection(), this.canvasEdit.context());
    }
    const docCenter = visibleCenter(this.canvas.view(), this.canvas.viewport());
    const parentEl = target.kind === 'node' ? doc.node(target.parent) : null;
    return { target, center: toLocal(this.canvas.host, parentEl, docCenter) };
  }

  /** Runs the insertion of `markups` at `place` as one step; selects the new nodes. */
  private insert(store: DocumentStore, label: UndoLabel, place: Place, markups: string[]): boolean {
    const doc = store.document();
    try {
      if (place.target.kind === 'node') {
        const { parent, index } = place.target;
        const inserts = markups.map((m, k) => new InsertNode(parent, m, index + k, label));
        store.execute(new CompositeCommand(label, inserts));
        const refs = inserts.flatMap((i) => (i.ref ? [i.ref] : []));
        this.selectPainted(store, refs);
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

  private async run(label: UndoLabel, args: Args, build: (c: Point) => string[] | null) {
    const store = await this.ensureStore();
    if (!store) return false;
    const place = this.place(store, args);
    const markups = place ? build(place.center) : null;
    if (!place || !markups?.length) {
      this.files.notice.set(T.addFailed);
      return false;
    }
    return this.insert(store, label, place, markups);
  }

  /** Container, circle … text (design 008 E5/E6). */
  addShape(kind: ShapeKind, args?: Args): Promise<boolean> {
    return this.run(LABELS[kind], args, (c) => {
      const spec = applyShapeArgs(kind, defaultShape(kind, c), args);
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

  /**
   * An image (design 008 E8): `href` from the caller (data URL only) or from the file dialog;
   * natural size, made smaller to at most 512, centred.
   */
  async addImage(args?: Args): Promise<boolean> {
    let href = typeof args?.['href'] === 'string' ? args['href'] : null;
    let natural: { width: number; height: number } | null;
    if (href !== null) {
      if (!isImageDataUrl(href)) {
        this.files.notice.set(T.imageFailed);
        return false;
      }
      natural = svgDataUrlSize(href);
    } else {
      try {
        const path = await this.api.pickImageFile();
        if (!path) return false;
        const file = await this.api.readImageFile(path);
        href = file.dataUrl;
        natural =
          file.width && file.height
            ? { width: file.width, height: file.height }
            : svgDataUrlSize(file.dataUrl);
      } catch (e) {
        this.files.notice.set(`${T.imageFailed} ${describeFsError(toFsError(e))}`);
        return false;
      }
    }
    const fitted = fitImage(natural?.width ?? 0, natural?.height ?? 0);
    const num = (k: string) => (typeof args?.[k] === 'number' ? (args[k] as number) : undefined);
    const w = num('width') ?? fitted.width;
    const h = num('height') ?? fitted.height;
    const url = href;
    return this.run('addImage', args, (c) => {
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
