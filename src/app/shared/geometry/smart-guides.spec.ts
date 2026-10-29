import { smartSnap, touchPoints } from './smart-guides';
import { snapPoint } from './snapping';

describe('Smart Guides (prompt 040)', () => {
  const circle = { kind: 'circle' as const, c: { x: 100, y: 0 }, r: 50 };
  const edge = { kind: 'segment' as const, a: { x: -100, y: 100 }, b: { x: 200, y: 100 } };
  const from = { x: 0, y: 0 };

  it('tangent points of a circle and the foot of the perpendicular', () => {
    const t = touchPoints(from, [circle, edge]);
    const tangents = t.filter((x) => x.tag === 'tangent');
    expect(tangents).toHaveLength(2);
    for (const p of tangents) {
      // the radius is square to the line from `from`
      const r = { x: p.point.x - 100, y: p.point.y };
      expect(r.x * p.point.x + r.y * p.point.y).toBeCloseTo(0, 9);
    }
    expect(t.find((x) => x.tag === 'perpendicular')?.point).toEqual({ x: 0, y: 100 });
  });

  it('priority: tangent / perpendicular, then on the path, then construction guides', () => {
    const tan = touchPoints(from, [circle])[0].point;
    const hit = smartSnap({ x: tan.x + 1, y: tan.y + 1 }, { outlines: [circle], from }, 5);
    expect(hit).toMatchObject({ tag: 'tangent', point: tan });
    expect(smartSnap({ x: 100, y: 53 }, { outlines: [circle], from }, 5)).toMatchObject({
      tag: 'path',
      point: { x: 100, y: 50 },
    });
    // near the 45° guide through `from`: on it, with its guide line
    const c = smartSnap({ x: 300, y: -297 }, { outlines: [], from }, 5);
    expect(c!.point.x).toBeCloseTo(298.5, 9);
    expect(c!.point.y).toBeCloseTo(-298.5, 9);
    expect(c!.guides).toEqual([{ from, to: c!.point }]);
    expect(smartSnap({ x: 300, y: -250 }, { outlines: [], from }, 5)).toBeNull();
  });

  it('a construction guide slides into line with a marked point', () => {
    const c = smartSnap({ x: 300, y: 2 }, { outlines: [], from }, 5, [{ x: 303, y: 400 }], 6);
    expect(c!.point).toEqual({ x: 303, y: 0 });
    expect(c!.guides).toHaveLength(2);
  });

  it('extensions keep a dragged point on the line of its segment', () => {
    const r = snapPoint({ x: 150, y: 152 }, [], {
      zoom: 1,
      grid: false,
      magic: true,
      scene: { outlines: [], extensions: [{ at: { x: 0, y: 0 }, dir: { x: 1, y: 1 } }] },
    });
    expect(r.kind).toBe('guide');
    expect(r.point.x).toBeCloseTo(151, 9);
    expect(r.point.y).toBeCloseTo(151, 9);
    // the Smart Guides switch off: nothing
    expect(
      snapPoint({ x: 150, y: 152 }, [], {
        zoom: 1,
        grid: false,
        magic: true,
        smart: false,
        scene: { outlines: [], extensions: [{ at: { x: 0, y: 0 }, dir: { x: 1, y: 1 } }] },
      }).kind,
    ).toBe('none');
  });
});
