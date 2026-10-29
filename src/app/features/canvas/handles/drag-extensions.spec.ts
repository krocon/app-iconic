import { IDENTITY } from '../../../shared/geometry/matrix';
import { dragExtensions } from './drag-extensions';

describe('drag extensions (prompt 040)', () => {
  it('a line end keeps to its line; a vertex to the segments to its neighbours', () => {
    expect(
      dragExtensions(
        { kind: 'line', x1: 0, y1: 0, x2: 10, y2: 5 },
        { t: 'lineEnd', end: 2 },
        IDENTITY,
      ),
    ).toEqual([{ at: { x: 0, y: 0 }, dir: { x: 10, y: 5 } }]);
    const tri = {
      kind: 'poly' as const,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ],
      closed: true,
    };
    const r = dragExtensions(tri, { t: 'vertex', index: 0 }, IDENTITY);
    expect(r.map((x) => x.at)).toEqual([
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]);
    expect(dragExtensions(tri, { t: 'move' }, IDENTITY)).toEqual([]);
  });
});
