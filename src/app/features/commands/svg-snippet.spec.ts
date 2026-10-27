import { snippetElements, snippetMarkups } from './svg-snippet';

const els = (text: string) => {
  const r = snippetElements(text);
  if ('error' in r) throw new Error(r.error);
  return r.elements;
};
const names = (list: Element[]) => list.map((e) => e.localName);

describe('snippetElements (design 008 E9)', () => {
  it('unpacks a whole <svg>, keeps defs, drops notes', () => {
    const list = els(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>t</title>' +
        '<defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><circle/></svg>',
    );
    expect(names(list)).toEqual(['defs', 'rect', 'circle']);
  });

  it('takes several roots of a fragment', () => {
    expect(names(els('<rect/> <circle/><!-- c --><g><path/></g>'))).toEqual([
      'rect',
      'circle',
      'g',
    ]);
  });

  it('cleans hostile markup before anything else', () => {
    const list = els(
      '<rect onclick="x()" href="javascript:alert(1)"/><script>alert(1)</script>' +
        '<image href="https://evil/x.png"/><foreignObject><div/></foreignObject><circle/>',
    );
    expect(names(list)).toEqual(['rect', 'image', 'circle']);
    const text = list.map((e) => new XMLSerializer().serializeToString(e)).join('');
    expect(text).not.toMatch(/onclick|javascript|evil/);
  });

  it('reports empty, invalid and definitions-only markup', () => {
    expect(snippetElements('  ')).toEqual({ error: 'empty' });
    expect(snippetElements('<rect')).toEqual({ error: 'invalid' });
    expect(snippetElements('hello')).toEqual({ error: 'invalid' });
    expect(snippetElements('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toEqual({
      error: 'empty',
    });
    expect(snippetElements('<defs><linearGradient id="g"/></defs>')).toEqual({ error: 'empty' });
    expect(snippetElements('<script>x</script>')).toEqual({ error: 'empty' });
  });
});

describe('snippetMarkups', () => {
  it('renames colliding ids (references follow) and centres painting nodes', () => {
    const list = els(
      '<defs><linearGradient id="g"/></defs><rect id="r" fill="url(#g)" transform="rotate(5)"/>',
    );
    const taken = new Set(['g']);
    const out = snippetMarkups(list, taken, { x: 512, y: 512 }, () => ({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    }));
    expect(out[0]).toContain('id="g-2"');
    expect(out[0]).not.toContain('transform');
    expect(out[1]).toContain('fill="url(#g-2)"');
    expect(out[1]).toContain('transform="translate(462 487) rotate(5)"');
    expect(taken.has('r')).toBe(true);
  });

  it('keeps the place without layout (jsdom)', () => {
    const out = snippetMarkups(els('<rect/>'), new Set(), { x: 1, y: 2 });
    expect(out[0]).not.toContain('transform');
  });
});
