import { layerTransform } from '../canvas/asset-placement';
import { apply } from '../../shared/geometry/matrix';
import {
  canvasMarks,
  fitScale,
  frameCorners,
  movedPosition,
  NO_POSITION,
  positionMatrix,
  positionValue,
  readPosition,
  scaledPosition,
} from './layer-position';

describe('layer position (prompt 080, semantics of design 004 E4)', () => {
  it('reads a position; missing or broken parts are the identity', () => {
    expect(readPosition({ scale: 0.35, 'translation-in-points': [300, -170] })).toEqual({
      scale: 0.35,
      tx: 300,
      ty: -170,
    });
    expect(readPosition(undefined)).toEqual(NO_POSITION);
    expect(readPosition({ scale: 'x', 'translation-in-points': [1] })).toEqual(NO_POSITION);
  });

  it('the matrix is the transform the canvas draws (y down, scale about the centre)', () => {
    const pos = { scale: 0.5, 'translation-in-points': [-360, 330] };
    const m = positionMatrix(readPosition(pos));
    const t = layerTransform({ position: pos })!;
    expect(t).toBe('translate(152 842) scale(0.5) translate(-512 -512)');
    // the centre goes to centre + t, a corner halfway to it
    expect(apply(m, { x: 512, y: 512 })).toEqual({ x: 152, y: 842 });
    expect(apply(m, { x: 0, y: 0 })).toEqual({ x: -104, y: 586 });
  });

  it('Spacedrive: a 512 px PNG at scale 2 fills the canvas', () => {
    const m = positionMatrix({ scale: 2, tx: 0, ty: 0 });
    expect(frameCorners(m, { x: 256, y: 256, width: 512, height: 512 })).toEqual([
      { x: 0, y: 0 },
      { x: 1024, y: 0 },
      { x: 1024, y: 1024 },
      { x: 0, y: 1024 },
    ]);
  });

  it('moving divides by the group scale', () => {
    expect(movedPosition({ scale: 2, tx: 1, ty: 2 }, { x: 10, y: -20 }, 0.5)).toEqual({
      scale: 2,
      tx: 21,
      ty: -38,
    });
  });

  it('scaling keeps the given asset point where it is', () => {
    const p = { scale: 0.8, tx: 40, ty: -10 };
    const centre = { x: 300, y: 700 };
    const before = apply(positionMatrix(p), centre);
    const q = scaledPosition(p, centre, 1.5);
    expect(q.scale).toBeCloseTo(1.2);
    const after = apply(positionMatrix(q), centre);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    // centred content: the translation stays
    expect(scaledPosition(p, { x: 512, y: 512 }, 2)).toEqual({ scale: 1.6, tx: 40, ty: -10 });
    // never 0 or negative, never absurd
    expect(scaledPosition(p, centre, 0).scale).toBe(0.01);
    expect(scaledPosition(p, centre, 1e9).scale).toBe(100);
  });

  it('writes the value rounded, keeps unknown keys and their order', () => {
    expect(positionValue(undefined, { scale: 1 / 3, tx: 0.123456, ty: -0.004 })).toEqual({
      scale: 0.3333,
      'translation-in-points': [0.12, 0],
    });
    const old = { 'x-future': 1, scale: 1, 'translation-in-points': [0, 0] };
    const v = positionValue(old, { scale: 2, tx: 5, ty: 6 });
    expect(Object.keys(v as object)).toEqual(['x-future', 'scale', 'translation-in-points']);
    expect(v).toEqual({ 'x-future': 1, scale: 2, 'translation-in-points': [5, 6] });
  });

  it('fits only images larger than the canvas', () => {
    expect(fitScale(512, 512)).toBeNull();
    expect(fitScale(1024, 300)).toBeNull();
    expect(fitScale(4096, 2048)).toBe(0.25);
    expect(fitScale(1248, 1679)).toBeCloseTo(0.609887, 6);
  });

  it('snap marks: corners, edge middles, centre', () => {
    expect(canvasMarks()).toHaveLength(9);
    expect(canvasMarks()).toContainEqual({ x: 512, y: 512 });
  });
});
