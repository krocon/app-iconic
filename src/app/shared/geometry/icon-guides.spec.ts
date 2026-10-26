import { iconGuides } from './icon-guides';

describe('iconGuides', () => {
  it('has two diagonals and 7 horizontal + 7 vertical lines at 128 … 896', () => {
    const { lines } = iconGuides();
    expect(lines).toHaveLength(2 + 14);
    const horizontal = lines.filter((l) => l.y1 === l.y2).map((l) => l.y1);
    expect(horizontal).toEqual([128, 256, 384, 512, 640, 768, 896]);
  });

  it('has circles of diameter 820, 512 and 204 around the centre', () => {
    const { circles } = iconGuides();
    expect(circles.map((c) => c.r * 2)).toEqual([820, 512, 204]);
    expect(circles.every((c) => c.cx === 512 && c.cy === 512)).toBe(true);
  });
});
