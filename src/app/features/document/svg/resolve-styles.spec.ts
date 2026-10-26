import { parseSvg, serializeAsset } from './node-ids';
import { normalizeLength, resolveStyles } from './resolve-styles';

/** The cascade itself needs a browser – see `e2e/document.spec.ts`. */
describe('resolve-styles', () => {
  it('normalises units of lengths', () => {
    expect(normalizeLength('12px', 16)).toBe('12');
    expect(normalizeLength('1.5em', 10)).toBe('15');
    expect(normalizeLength('50%', 16)).toBe('50%');
    expect(normalizeLength('5px, 2px', 16)).toBe('5, 2');
    expect(normalizeLength('-.5px', 16)).toBe('-.5');
  });

  it('without a cascade (jsdom) still normalises attribute units and keeps styles', () => {
    const svg = parseSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10px" height="2em" x="5%"/></svg>',
    )!;
    expect(resolveStyles(svg.doc.documentElement)).toBe(false);
    expect(serializeAsset(svg)).toContain('<rect width="10" height="32" x="5%"/>');
  });
});
