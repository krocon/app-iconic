import { parsePath } from './path-data';
import { shapeToPath } from './shape-path';

describe('shapeToPath', () => {
  it('circle and ellipse as two arcs', () => {
    expect(shapeToPath('circle', { cx: '12', cy: '12', r: '10' })).toBe(
      'M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12Z',
    );
    expect(shapeToPath('ellipse', { cx: '0', cy: '0', rx: '4', ry: '2' })).toBe(
      'M-4 0A4 2 0 1 0 4 0A4 2 0 1 0 -4 0Z',
    );
    expect(shapeToPath('circle', { cx: '1', cy: '1', r: '0' })).toBeNull();
  });

  it('rect, with rounded corners (rx alone, clamped)', () => {
    expect(shapeToPath('rect', { x: '2', y: '3', width: '10', height: '4' })).toBe('M2 3H12V7H2Z');
    const d = shapeToPath('rect', { x: '0', y: '0', width: '10', height: '4', rx: '9' })!;
    expect(d.startsWith('M5 0H5A5 2 0 0 1 10 2')).toBe(true);
    expect(parsePath(d)).not.toBeNull();
    expect(shapeToPath('rect', { width: '0', height: '4' })).toBeNull();
  });

  it('line, polyline, polygon, path', () => {
    expect(shapeToPath('line', { x1: '1', y1: '2', x2: '3', y2: '4' })).toBe('M1 2L3 4');
    expect(shapeToPath('polyline', { points: '1,2 3,4 5,6' })).toBe('M1 2L3 4L5 6');
    expect(shapeToPath('polygon', { points: '1 2, 3 4 5' })).toBe('M1 2L3 4Z');
    expect(shapeToPath('polygon', { points: '1 2' })).toBeNull();
    expect(shapeToPath('path', { d: 'M0 0L1 1' })).toBe('M0 0L1 1');
    expect(shapeToPath('text', {})).toBeNull();
    expect(shapeToPath('line', { x1: 'x' })).toBeNull();
  });
});
