import { IconDocument } from '../icon-document';
import { parseSvg } from './node-ids';
import { brokenReferences, collectIds, referencedIds, renameCollidingIds } from './svg-references';

const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';
const root = (body: string) =>
  parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" ${XLINK}>${body}</svg>`)!.root;

describe('svg references (design 006)', () => {
  it('finds ids and references (url(), href, xlink:href, style)', () => {
    const r = root(
      '<defs><linearGradient id="g"/><clipPath id="c"/></defs>' +
        '<rect fill="url(#g)" style="clip-path: url(\'#c\')"/><use href="#u"/><use xlink:href="#v"/>',
    );
    expect([...collectIds(r)].sort()).toEqual(['c', 'g']);
    expect([...referencedIds(r)].sort()).toEqual(['c', 'g', 'u', 'v']);
  });

  it('renames colliding ids and their references inside the pasted elements', () => {
    const r = root('<g id="a"><rect id="b" fill="url(#b)"/><use href="#a"/><use href="#x"/></g>');
    const taken = new Set(['a', 'a-2', 'x']);
    const map = renameCollidingIds([r.firstElementChild!], taken);
    expect([...map]).toEqual([['a', 'a-3']]);
    const g = r.firstElementChild!;
    expect(g.getAttribute('id')).toBe('a-3');
    expect(g.children[0].getAttribute('fill')).toBe('url(#b)');
    expect(g.children[1].getAttribute('href')).toBe('#a-3');
    expect(g.children[2].getAttribute('href')).toBe('#x');
    expect(taken.has('a-3') && taken.has('b')).toBe(true);
  });

  it('two pasted copies of the same id get different names', () => {
    const r = root('<rect id="r"/><rect id="r"/>');
    renameCollidingIds([...r.children], new Set());
    expect([...r.children].map((e) => e.id)).toEqual(['r', 'r-2']);
  });

  it('reports references that break when nodes change the asset', () => {
    const doc = IconDocument.fromDto({
      path: null,
      name: null,
      format: 'bundle',
      iconJson: {},
      assets: [
        {
          name: 'a.svg',
          kind: 'svg',
          text:
            `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs>` +
            `<rect fill="url(#g)"/><g><clipPath id="c"/><circle fill="url(#h)"/></g>` +
            `<path clip-path="url(#c)"/></svg>`,
        },
        {
          name: 'b.svg',
          kind: 'svg',
          text: '<svg xmlns="http://www.w3.org/2000/svg"><linearGradient id="h"/></svg>',
        },
      ],
      warnings: [],
    });
    // n4 rect → url(#g) missing in b; n5 g holds #c that path n8 still uses, url(#h) exists in b
    expect(brokenReferences(doc, [{ asset: 'a.svg', id: 'n4' }], 'b.svg')).toEqual(['g']);
    expect(brokenReferences(doc, [{ asset: 'a.svg', id: 'n5' }], 'b.svg')).toEqual(['c']);
    expect(brokenReferences(doc, [{ asset: 'a.svg', id: 'n4' }], 'a.svg')).toEqual([]);
  });
});
