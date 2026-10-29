import { polygonCorners } from './sketch-shapes';
import { dragShape, sizedShape, square, step45 } from './drag-shapes';

describe('drag tools like VectorCraft (prompt 041)', () => {
  const a = { x: 100, y: 100 };

  it('rectangle: corner to corner; Shift a square; Alt from the centre', () => {
    expect(dragShape('dragRect', a, { x: 160, y: 140 })).toEqual({
      kind: 'rect',
      c: { x: 130, y: 120 },
      w: 60,
      h: 40,
      angle: 0,
    });
    // dragged up and left: the square keeps that side
    expect(dragShape('dragRect', a, { x: 40, y: 80 }, { shift: true })).toMatchObject({
      c: { x: 70, y: 70 },
      w: 60,
      h: 60,
    });
    expect(dragShape('dragRect', a, { x: 160, y: 140 }, { alt: true })).toMatchObject({
      c: a,
      w: 120,
      h: 80,
    });
  });

  it('ellipse: the box of the drag; Shift + Alt a circle around the start', () => {
    expect(dragShape('dragEllipse', a, { x: 160, y: 140 })).toEqual({
      kind: 'ellipse',
      c: { x: 130, y: 120 },
      rx: 30,
      ry: 20,
    });
    expect(dragShape('dragEllipse', a, { x: 130, y: 110 }, { shift: true, alt: true })).toEqual({
      kind: 'ellipse',
      c: a,
      rx: 30,
      ry: 30,
    });
  });

  it('polygon: from the centre, the pointer a corner; Shift keeps a corner up; sides given', () => {
    const s = dragShape('dragPolygon', a, { x: 150, y: 100 }, {}, 5);
    expect(s).toMatchObject({ kind: 'polygon', c: a, r: 50, sides: 5 });
    const up = dragShape('dragPolygon', a, { x: 150, y: 100 }, { shift: true }, 5);
    const first = up?.kind === 'polygon' ? polygonCorners(up)[0] : null;
    expect(first!.x).toBeCloseTo(100, 9);
    expect(first!.y).toBeCloseTo(50, 9);
  });

  it('line: Shift in 45° steps (length kept); Alt from the centre', () => {
    expect(step45({ x: 10, y: 1 })).toEqual({ x: Math.hypot(10, 1), y: 0 });
    expect(square({ x: -3, y: 5 })).toEqual({ x: -5, y: 5 });
    expect(dragShape('dragLine', a, { x: 130, y: 104 }, { shift: true })).toMatchObject({
      a,
      b: { x: 100 + Math.hypot(30, 4), y: 100 },
    });
    expect(dragShape('dragLine', a, { x: 130, y: 140 }, { alt: true })).toEqual({
      kind: 'line',
      a: { x: 70, y: 60 },
      b: { x: 130, y: 140 },
    });
  });

  it('a click asks for the size: rectangle/ellipse by the top left, polygon around the click', () => {
    expect(sizedShape('dragRect', a, { width: 40, height: 20 })).toMatchObject({
      c: { x: 120, y: 110 },
      w: 40,
      h: 20,
    });
    expect(sizedShape('dragPolygon', a, { radius: 50, sides: 6 })).toMatchObject({
      c: a,
      r: 50,
      sides: 6,
    });
    expect(sizedShape('dragLine', a, { length: 10, angle: 90 })).toMatchObject({
      b: { x: 100, y: 90 },
    });
    expect(sizedShape('dragEllipse', a, { width: 0, height: 20 })).toBeNull();
  });
});
