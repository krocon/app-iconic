import { describe, expect, it } from 'vitest';
import { atPath, indexPath, mapSelection } from './selection-map';

const parse = (s: string) => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;

describe('selection-map (design 011 E6)', () => {
  const oldRoot = parse('<svg><g><rect/><circle/></g><path/></svg>');
  const rect = oldRoot.querySelector('rect')!;
  const circle = oldRoot.querySelector('circle')!;
  const path = oldRoot.querySelector('path')!;

  it('index paths go there and back', () => {
    expect(indexPath(oldRoot, circle)).toEqual([0, 1]);
    expect(indexPath(oldRoot, oldRoot)).toEqual([]);
    expect(atPath(oldRoot, [0, 1])).toBe(circle);
    expect(indexPath(parse('<svg/>'), circle)).toBeNull();
  });

  it('finds elements of the same name at the same place, drops the others', () => {
    const newRoot = parse('<svg><g><rect fill="red"/><ellipse/></g><path d="M0 0"/></svg>');
    const mapped = mapSelection(oldRoot, newRoot, [rect, circle, path]);
    expect(mapped.map((e) => e.localName)).toEqual(['rect', 'path']);
    expect(mapped[0]).toBe(newRoot.querySelector('rect'));
  });
});
