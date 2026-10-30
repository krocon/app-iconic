import { symbolFromMarkup } from './symbol-flatten';

describe('symbolFromMarkup (design 084 E11)', () => {
  it('flattens groups: paint inherits, transforms chain, shapes become paths', () => {
    const s = symbolFromMarkup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 50" fill="currentColor">
        <title>x</title>
        <g transform="translate(5 5)" stroke="#ff0000" stroke-width="2" opacity="0.5">
          <rect x="0" y="0" width="10" height="10" transform="scale(2)" fill="none"/>
          <g opacity="0.5"><circle cx="5" cy="5" r="5"/></g>
        </g>
        <path d="M0 0h1"/>
      </svg>`,
    )!;
    expect(s.width).toBe(100);
    expect(s.height).toBe(50);
    expect(s.group.attrs).toEqual({ fill: '#000000', stroke: 'none' });
    const [rect, circle, path] = s.group.children!;
    expect(rect.attrs).toMatchObject({
      fill: 'none',
      stroke: '#ff0000',
      'stroke-width': '2',
      transform: 'translate(-10 -20) translate(5 5) scale(2)',
      opacity: '0.5',
    });
    expect(rect.attrs['d']).toMatch(/^M0 0/);
    expect(circle.attrs['opacity']).toBe('0.25');
    expect(circle.attrs['fill']).toBe('#000000');
    expect(path.attrs).toEqual({ d: 'M0 0h1', fill: '#000000', transform: 'translate(-10 -20)' });
    expect(s.markup).toContain('viewBox="0 0 100 50"');
  });

  it('drops what is hostile (sanitizeSvg, defence in depth) and refuses what draws nothing', () => {
    const s = symbolFromMarkup(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)">
        <script>alert(1)</script><path d="M0 0h10" onclick="x()"/>
        <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
      </svg>`,
    )!;
    expect(s.markup).not.toMatch(/script|onload|onclick|foreignObject/);
    expect(s.group.children!.length).toBe(1);
    expect(
      symbolFromMarkup('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'),
    ).toBeNull();
    expect(
      symbolFromMarkup('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),
    ).toBeNull();
    expect(symbolFromMarkup('not xml')).toBeNull();
    expect(symbolFromMarkup('<html/>')).toBeNull();
  });
});
