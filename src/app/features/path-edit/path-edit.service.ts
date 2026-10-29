import { inject, Injectable } from '@angular/core';
import { nodeToDocument } from '../../shared/geometry/dom-geometry';
import { apply, fromDom, invert, Matrix } from '../../shared/geometry/matrix';
import { ellipseSubpath, roundRectSubpath } from '../../shared/geometry/sketch/more-shapes';
import {
  fromSubpaths,
  joinEnds,
  mapSubpaths,
  Subpath,
  toSubpaths,
} from '../../shared/geometry/pen/path-model';
import { CanvasViewStore } from '../canvas/canvas-view.store';
import { readGeometry } from '../canvas/handles/node-geometry';
import {
  CompositeCommand,
  DocCommand,
  InsertNode,
  RemoveNode,
  ReplaceNode,
  SetAttributes,
} from '../document/commands';
import { NodeRef } from '../document/icon-document';
import { ID_ATTR } from '../document/svg/node-ids';
import { CORNERS_ATTR } from '../corners/corner-source';
import { FilesService } from '../files/files.service';
import { UndoLabel } from '../document/undo/undo-texts';

/** A selected element as subpaths in document units. */
export interface PathTarget {
  ref: NodeRef;
  el: Element;
  subpaths: Subpath[];
  toLocal: Matrix;
}

/** Attributes of a shape that are its geometry (not kept when it becomes a path). */
const GEOMETRY = [
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'd',
];

/** The outline of a shape element as subpaths in its user space (`null`: no outline). */
export function shapeSubpaths(el: Element): Subpath[] | null {
  const g = readGeometry(el);
  switch (g.kind) {
    case 'path':
      return toSubpaths(el.getAttribute('d') ?? '');
    case 'rect': {
      if (!(g.width > 0 && g.height > 0)) return null;
      const c = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
      return [roundRectSubpath(c, g.width, g.height, g.rx || g.ry)];
    }
    case 'circle':
      return g.r > 0 ? [ellipseSubpath({ x: g.cx, y: g.cy }, g.r, g.r)] : null;
    case 'ellipse':
      return g.rx > 0 && g.ry > 0 ? [ellipseSubpath({ x: g.cx, y: g.cy }, g.rx, g.ry)] : null;
    case 'line':
      return [
        { anchors: [{ p: { x: g.x1, y: g.y1 } }, { p: { x: g.x2, y: g.y2 } }], closed: false },
      ];
    case 'poly':
      return g.points.length >= 2
        ? [{ anchors: g.points.map((p) => ({ p })), closed: g.closed }]
        : null;
    default:
      return null;
  }
}

/** A `<path>` with the attributes of `el` (paint, transform …) but its geometry, and `d`. */
export function pathMarkup(el: Element, d: string): string {
  const path = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
  for (const a of Array.from(el.attributes)) {
    if (!GEOMETRY.includes(a.name) && a.name !== ID_ATTR && a.name !== CORNERS_ATTR) {
      path.setAttribute(a.name, a.value);
    }
  }
  path.setAttribute('d', d);
  for (const c of Array.from(el.childNodes)) path.appendChild(c.cloneNode(true));
  return new XMLSerializer().serializeToString(path);
}

/**
 * The selected paths as the path tools see them and how their edits are written (prompt 046):
 * a `<path>` gets a new `d` (and loses the Live Corners source), any other shape becomes a
 * `<path>`; every edit is one undo step.
 */
@Injectable({ providedIn: 'root' })
export class PathEditService {
  private readonly files = inject(FilesService);
  private readonly view = inject(CanvasViewStore);

  /** The selected elements with an outline, in document units. */
  targets(): PathTarget[] {
    const store = this.files.store();
    const host = this.view.host;
    if (!store || !host) return [];
    return store.selection().flatMap((ref) => {
      const el = store.document().node(ref);
      const sub = el ? shapeSubpaths(el) : null;
      const m = el instanceof SVGGraphicsElement ? nodeToDocument(host, el) : null;
      const toDoc = m ? fromDom(m) : null;
      const toLocal = toDoc ? invert(toDoc) : null;
      if (!el || !sub || !toDoc || !toLocal) return [];
      return [{ ref, el, toLocal, subpaths: mapSubpaths(sub, (p) => apply(toDoc, p)) }];
    });
  }

  /** The command writing `subpaths` (document units) into `t`. */
  command(t: PathTarget, subpaths: readonly Subpath[], label: UndoLabel = 'editPath'): DocCommand {
    const d = fromSubpaths(mapSubpaths(subpaths, (p) => apply(t.toLocal, p)));
    if (t.el.localName === 'path') {
      return new SetAttributes(
        [
          { ref: t.ref, name: 'd', value: d },
          ...(t.el.hasAttribute(CORNERS_ATTR)
            ? [{ ref: t.ref, name: CORNERS_ATTR, value: null }]
            : []),
        ],
        label,
      );
    }
    return new CompositeCommand(label, [new ReplaceNode(t.ref, pathMarkup(t.el, d))]);
  }

  /** Writes `subpaths` into `t` (one undo step); the selection follows a replaced node. */
  write(t: PathTarget, subpaths: readonly Subpath[], extra: DocCommand[] = []): void {
    const store = this.files.store();
    if (!store) return;
    const cmd = this.command(t, subpaths);
    store.execute(extra.length ? new CompositeCommand('editPath', [cmd, ...extra]) : cmd);
    store.selection.set([this.refAfter(cmd, t.ref)]);
  }

  refAfter(cmd: DocCommand, ref: NodeRef): NodeRef {
    const inner = cmd instanceof CompositeCommand ? cmd.commands[0] : cmd;
    return inner instanceof ReplaceNode ? (inner.newRef ?? ref) : ref;
  }

  /** A new path beside `t` (the part the Scissors cut off) – inserted into the same parent. */
  sibling(t: PathTarget, subpaths: readonly Subpath[]): DocCommand | null {
    const store = this.files.store();
    const parent = t.el.parentElement;
    const parentRef = parent ? store?.document().refOf(parent) : null;
    if (!parentRef) return null;
    const d = fromSubpaths(mapSubpaths(subpaths, (p) => apply(t.toLocal, p)));
    return new InsertNode(parentRef, pathMarkup(t.el, d));
  }

  canConvert(): boolean {
    return this.targets().some((t) => t.el.localName !== 'path');
  }

  canJoin(): boolean {
    return this.targets().some((t) => t.subpaths.some((s) => !s.closed && s.anchors.length >= 2));
  }

  /** Object › Convert to Path: the selected shapes become paths (one undo step). */
  convert(): boolean {
    const store = this.files.store();
    const ts = this.targets().filter((t) => t.el.localName !== 'path');
    if (!store || !ts.length) return false;
    const cmds = ts.map((t) => ({ t, c: this.command(t, t.subpaths, 'convertToPath') }));
    store.execute(
      new CompositeCommand(
        'convertToPath',
        cmds.map((x) => x.c),
      ),
    );
    store.selection.set(
      store.selection().map((r) => {
        const hit = cmds.find((x) => x.t.ref === r);
        return hit ? this.refAfter(hit.c, r) : r;
      }),
    );
    return true;
  }

  /**
   * Object › Join: the two open ends nearest to each other among the selected paths become one
   * (a straight segment between them); a single open subpath closes. The second path goes.
   */
  join(): boolean {
    const store = this.files.store();
    const ts = this.targets();
    if (!store || !ts.length) return false;
    const ends = ts.flatMap((t, ti) =>
      t.subpaths.flatMap((sp, s) =>
        sp.closed || sp.anchors.length < 2
          ? []
          : (['start', 'end'] as const).map((which) => ({
              ti,
              s,
              which,
              p: which === 'start' ? sp.anchors[0].p : sp.anchors[sp.anchors.length - 1].p,
            })),
      ),
    );
    if (ends.length < 2) return false;
    let best: { a: (typeof ends)[number]; b: (typeof ends)[number]; d: number } | null = null;
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const a = ends[i];
        const b = ends[j];
        if (
          a.ti === b.ti &&
          a.s === b.s &&
          ends.filter((e) => e.ti === a.ti && e.s === a.s).length === 2
        ) {
          // the two ends of one subpath: only if nothing else is open
          if (ends.length > 2) continue;
        }
        const d = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    if (!best) return false;
    const { a, b } = best;
    const ta = ts[a.ti];
    if (a.ti === b.ti) {
      const order = a.which === 'end' ? [a, b] : [b, a];
      this.write(ta, joinEnds(ta.subpaths, order[0].s, order[0].which, order[1].s, order[1].which));
      return true;
    }
    // the other path's subpaths join this one; it goes away
    const tb = ts[b.ti];
    const merged = [...ta.subpaths, ...tb.subpaths];
    const joined = joinEnds(merged, a.s, a.which, ta.subpaths.length + b.s, b.which);
    this.write(ta, joined, [new RemoveNode(tb.ref)]);
    return true;
  }
}
