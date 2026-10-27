import { describe, expect, it } from 'vitest';
import { SVG_NS } from './node-ids';
import { styleValue, styleWithout } from './style-props';

function el(style: string): Element {
  const doc = document.implementation.createDocument(SVG_NS, 'svg', null);
  const e = doc.createElementNS(SVG_NS, 'rect');
  e.setAttribute('style', style);
  doc.documentElement.append(e);
  return e;
}

describe('styleWithout (design 010 E15: textual, the rest stays byte for byte)', () => {
  it('keeps unknown declarations exactly as written', () => {
    const s = "fill:#f00;-inkscape-font-specification:'Sans Bold';stroke:blue";
    expect(styleWithout(el(s), 'fill')).toBe(
      "-inkscape-font-specification:'Sans Bold';stroke:blue",
    );
  });

  it('keeps spacing, comments and the order of the other declarations', () => {
    const s = 'stroke : blue ;  /* note */ fill: red ; opacity:0.5;';
    expect(styleWithout(el(s), 'fill')).toBe('stroke : blue ;  /* note */ opacity:0.5;');
  });

  it('removes the last declaration with the separator before it', () => {
    expect(styleWithout(el('opacity:0.5; fill:red'), 'fill')).toBe('opacity:0.5');
    expect(styleWithout(el('opacity:0.5; fill:red;'), 'fill')).toBe('opacity:0.5;');
  });

  it('ignores case of the name and removes every occurrence', () => {
    expect(styleWithout(el('FILL:red;fill:blue;x-y:1'), 'fill')).toBe('x-y:1');
  });

  it('does not split inside strings, url() or comments', () => {
    const s = 'fill:url("data:a;b");marker-start:url(#m);font-family:"a;b"';
    expect(styleWithout(el(s), 'fill')).toBe('marker-start:url(#m);font-family:"a;b"');
    expect(styleWithout(el('/* fill:red; */stroke:red'), 'fill')).toBe('/* fill:red; */stroke:red');
  });

  it('does not remove a property whose name only starts the same', () => {
    expect(styleWithout(el('fill-opacity:0.5;fill:red'), 'fill')).toBe('fill-opacity:0.5');
  });

  it('several properties at once; nothing left → null', () => {
    expect(styleWithout(el('fill:red; stroke:blue'), 'fill', 'stroke')).toBeNull();
    expect(styleWithout(el(' ; '), 'fill')).toBeNull();
  });

  it('without the property the attribute stays as it is', () => {
    expect(styleWithout(el('-x-y: 1 ;stroke:blue'), 'fill')).toBe('-x-y: 1 ;stroke:blue');
  });

  it('a shorthand that still sets the property is removed through the CSSOM', (ctx) => {
    // jsdom's CSSOM does not split shorthands – the browsers do (Playwright, properties.spec)
    const probeCssom = el('font: 12px serif') as SVGElement;
    probeCssom.style.removeProperty('font-size');
    const reparsed = el(probeCssom.style.cssText);
    if (styleValue(reparsed, 'font-size')) ctx.skip();
    const e = el('font: 12px serif; fill: red');
    const rest = styleWithout(e, 'font-size');
    expect(rest).not.toBeNull();
    const probe = el(rest!);
    expect(styleValue(probe, 'font-size')).toBeNull();
    expect(styleValue(probe, 'fill')).toBe('red');
  });
});
