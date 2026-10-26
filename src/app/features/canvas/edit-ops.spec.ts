import { apply, multiply, translation } from '../../shared/geometry/matrix';
import {
  boxKeyPoints,
  moveChanges,
  pivotChanges,
  scaleNodeChanges,
  scaleSelectionChanges,
} from './edit-ops';

const ref = { asset: 'a.svg', id: 'n3' };
const scale2 = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 };

describe('canvas edit operations (design 007 E7, E11)', () => {
  it('moves in the parent space, folded into a leading translate', () => {
    expect(moveChanges([{ ref, transform: null, parent: scale2 }], { x: 10, y: -4 })).toEqual([
      { ref, name: 'transform', value: 'translate(5 -2)' },
    ]);
    expect(
      moveChanges([{ ref, transform: 'translate(1 1) rotate(9)', parent: translation(3, 3) }], {
        x: 1,
        y: 0,
      }),
    ).toEqual([{ ref, name: 'transform', value: 'translate(2 1) rotate(9)' }]);
    expect(
      moveChanges([{ ref, transform: null, parent: { ...scale2, a: 0, d: 0 } }], { x: 1, y: 1 }),
    ).toEqual([]);
  });

  it('scales one node in its own space: the opposite corner stays where it was', () => {
    const toDoc = scale2;
    const box = { x: 0, y: 0, width: 10, height: 10 };
    // bottom right (10, 10) local = (120, 70) document; drag it to (140, 90) = local (20, 20)
    const [c] = scaleNodeChanges({ ref, transform: null, toDoc, box }, 'bottomRight', {
      x: 140,
      y: 90,
    })!;
    expect(c.value).toBe('matrix(2 0 0 2 0 0)');
    const [d] = scaleNodeChanges({ ref, transform: 'rotate(10)', toDoc, box }, 'left', {
      x: 80,
      y: 60,
    })!;
    expect(d.value).toBe('rotate(10) matrix(2 0 0 1 -10 0)');
  });

  it('scales a selection by the union box in document space', () => {
    const parent = translation(100, 0);
    const box = { x: 100, y: 0, width: 100, height: 100 };
    const [c] = scaleSelectionChanges([{ ref, transform: null, parent }], box, 'right', {
      x: 300,
      y: 50,
    });
    // P⁻¹ · S(about 100,0; 2×) · P = scale 2 about local (0, 0)
    expect(c.value).toBe('matrix(2 0 0 1 0 0)');
    const m = { a: 2, b: 0, c: 0, d: 1, e: 0, f: 0 };
    expect(apply(multiply(parent, m), { x: 100, y: 0 })).toEqual({ x: 300, y: 0 });
  });

  it('moves a rotate pivot in the space the rotate works in', () => {
    const [c] = pivotChanges(
      {
        ref,
        transform: 'translate(5 5) rotate(30 1 2)',
        item: 1,
        angle: 30,
        toDoc: translation(10, 10),
      },
      { x: 20, y: 30 },
    )!;
    expect(c.value).toBe('translate(5 5) rotate(30 10 20)');
  });

  it('nine key points of a box', () => {
    expect(boxKeyPoints({ x: 0, y: 0, width: 2, height: 4 })).toHaveLength(9);
    expect(boxKeyPoints({ x: 0, y: 0, width: 2, height: 4 })).toContainEqual({ x: 1, y: 2 });
  });
});
