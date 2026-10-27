import { clipSpaceToDocument } from '../../shared/geometry/clip-geometry';
import { SVG_NS } from '../document/svg/node-ids';

/** Inline (the canvas's emulated style encapsulation does not reach elements built at run time). */
const SHAPE_STYLE =
  'fill: var(--ai-clip-fill); stroke: var(--ai-clip-stroke); stroke-width: 1.5px; ' +
  'vector-effect: non-scaling-stroke; pointer-events: none';

/**
 * The shapes of the clip path being edited, drawn in the canvas host `<svg>` (document units,
 * design 014 E7): copies without ids, clips or styles of their own, under one `<g>` with the matrix
 * clip space → document (`clipSpaceToDocument`, through the clip's owner). Never in the document
 * DOM; rebuilt after every paint while the mode is on.
 */
export class ClipEditLayer {
  private g: SVGGElement | null = null;

  constructor(private readonly host: SVGSVGElement) {}

  update(scope: Element | null): void {
    const m = scope ? clipSpaceToDocument(this.host, scope) : null;
    if (!scope || !m) {
      this.g?.remove();
      this.g = null;
      return;
    }
    const d = this.host.ownerDocument;
    if (!this.g || !this.g.isConnected) {
      this.g = d.createElementNS(SVG_NS, 'g') as SVGGElement;
      this.g.setAttribute('class', 'clip-edit');
      this.g.setAttribute('data-testid', 'clip-edit-shapes');
      this.host.append(this.g);
    }
    this.g.setAttribute('transform', `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].join(' ')})`);
    this.g.replaceChildren(
      ...Array.from(scope.children).map((c) => {
        const copy = c.cloneNode(true) as Element;
        for (const e of [copy, ...Array.from(copy.querySelectorAll('*'))]) {
          for (const n of e.getAttributeNames()) {
            if (n === 'id' || n === 'style' || n === 'clip-path' || n.startsWith('data-ai-')) {
              e.removeAttribute(n);
            }
          }
        }
        copy.setAttribute('style', SHAPE_STYLE);
        return copy;
      }),
    );
  }
}
