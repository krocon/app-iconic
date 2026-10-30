import { captureMarkup, inheritedPaint, stylePaint } from './symbol-capture';

const NS = 'http://www.w3.org/2000/svg';

function asset(markup: string): Element {
  return new DOMParser().parseFromString(
    `<svg xmlns="${NS}" viewBox="0 0 1024 1024">${markup}</svg>`,
    'image/svg+xml',
  ).documentElement;
}

describe('captureMarkup (design 084 E12)', () => {
  it('one group per node with its matrix and inherited paint; viewBox = union of the bounds', () => {
    const root = asset(
      `<g fill="#ff0000" style="stroke: blue; stroke-width: 3"><rect data-ai-id="n2" id="r" class="c" x="0" y="0" width="10" height="10" transform="translate(5 5)" style="fill-opacity: .5"/></g><circle data-ai-id="n3" r="4"/>`,
    );
    const [rect, circle] = [root.querySelector('rect')!, root.querySelector('circle')!];
    const svg = captureMarkup([
      {
        el: rect,
        matrix: { a: 2, b: 0, c: 0, d: 2, e: 10, f: 10 },
        bounds: { x: 10, y: 10, width: 20, height: 20 },
      },
      {
        el: circle,
        matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        bounds: { x: -4, y: -4, width: 8, height: 8 },
      },
    ])!;
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    expect(doc.getAttribute('viewBox')).toBe('-4 -4 34 34');
    const groups = Array.from(doc.children);
    expect(groups.map((g) => g.getAttribute('transform'))).toEqual([
      'matrix(2 0 0 2 10 10)',
      'matrix(1 0 0 1 0 0)',
    ]);
    expect(groups[0].getAttribute('fill')).toBe('#ff0000');
    expect(groups[0].getAttribute('stroke')).toBe('blue');
    expect(groups[0].getAttribute('stroke-width')).toBe('3');
    expect(groups[1].getAttribute('fill')).toBe('#000000');
    const r = groups[0].firstElementChild!;
    expect(r.getAttribute('transform')).toBeNull();
    expect(r.getAttribute('fill-opacity')).toBe('.5');
    for (const a of ['data-ai-id', 'id', 'class', 'style'])
      expect(r.hasAttribute(a), a).toBe(false);
    // the document itself is untouched
    expect(rect.getAttribute('data-ai-id')).toBe('n2');
  });

  it('nothing measurable = nothing to save', () => {
    const el = asset('<path d="M0 0"/>').firstElementChild!;
    expect(captureMarkup([])).toBeNull();
    expect(
      captureMarkup([
        {
          el,
          matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          bounds: { x: NaN, y: 0, width: 1, height: 1 },
        },
      ]),
    ).toBeNull();
  });

  it('style paint and inheritance (nearest wins, up to the asset root)', () => {
    expect(stylePaint('fill: red !important; color: x; stroke-width:2')).toEqual({
      fill: 'red',
      'stroke-width': '2',
    });
    const root = asset('<g fill="#111" stroke="#222"><g fill="#333"><path d="M0 0"/></g></g>');
    expect(inheritedPaint(root.querySelector('path')!)).toEqual({ fill: '#333', stroke: '#222' });
  });
});
