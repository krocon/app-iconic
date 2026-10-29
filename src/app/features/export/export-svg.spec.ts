import { IconDocument } from '../document/icon-document';
import { allFieldsDocument, camscannerDocument } from '../../../testing/documents';
import { squirclePath } from '../../shared/geometry/squircle';
import { exportSvg, prefixIds } from './export-svg';

const parse = (text: string) =>
  new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;

const gradient = (color: string) =>
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1024 1024">' +
  `<defs><linearGradient id="g"><stop stop-color="${color}"/></linearGradient>` +
  '<rect id="r" width="10" height="10"/></defs>' +
  '<rect width="1024" height="1024" fill="url(#g)" style="stroke:url(&quot;#g&quot;)"/>' +
  '<use xlink:href="#r"/><use href="#r"/></svg>';

function doc(groups: unknown[], extra: object = {}, assets?: Record<string, string>): IconDocument {
  return IconDocument.fromDto({
    path: null,
    name: null,
    format: 'bundle',
    iconJson: { groups: groups as never, ...extra },
    assets: [
      ...Object.entries(assets ?? { 'a.svg': gradient('#f00'), 'b.svg': gradient('#00f') }).map(
        ([name, text]) => ({ name, kind: 'svg' as const, text }),
      ),
      { name: 'p.png', kind: 'png' as const, dataUrl: 'data:image/png;base64,AAAA' },
    ],
    warnings: [],
  });
}

const L = (name: string, extra: object = {}) => ({ 'image-name': name, name, ...extra });
const NO_FX = { mask: 'none', effects: false } as const;

/** Every reference of the export resolves to an id that exists exactly once. */
function checkReferences(text: string): void {
  const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  expect(new Set(ids).size).toBe(ids.length);
  const refs = [
    ...[...text.matchAll(/url\((?:&quot;|['"])?#([^)'"&]+)/g)].map((m) => m[1]),
    ...[...text.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]),
  ];
  for (const r of refs) expect(ids).toContain(r);
}

describe('exportSvg', () => {
  it('camscanner.icon, light and dark (snapshot)', () => {
    const d = camscannerDocument();
    const light = exportSvg(d, 'light', NO_FX);
    const dark = exportSvg(d, 'dark', NO_FX);
    expect(light).toMatchSnapshot('light');
    expect(dark).toMatchSnapshot('dark');
    for (const t of [light, dark]) {
      expect(t.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<svg')).toBe(true);
      expect(t).not.toContain('data-ai-');
      expect(t).not.toContain('color(');
      checkReferences(t);
      const root = parse(t);
      expect(root.getAttribute('viewBox')).toBe('0 0 1024 1024');
      expect(root.getAttribute('width')).toBe('1024');
    }
    // the live document is untouched
    expect(d.assets.values().next().value!.svg!.root.getAttribute('data-ai-id')).not.toBeNull();
  });

  it('leaves the dimensions out unless asked for (prompt 048)', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="9" height="9"/>' +
      '<g data-dimension="linear"><path d="M0 0L9 0"/><text>9</text></g></svg>';
    const d = doc([{ layers: [L('a.svg')] }], {}, { 'a.svg': svg });
    expect(exportSvg(d, 'light', NO_FX)).not.toContain('data-dimension');
    expect(exportSvg(d, 'light', { ...NO_FX, dimensions: true })).toContain(
      'data-dimension="linear"',
    );
  });

  it('prefixes ids per layer and rewrites url(), href and xlink:href', () => {
    // b.svg twice: the same asset in two layers must not give duplicate ids either
    const t = exportSvg(
      doc([{ layers: [L('a.svg'), L('b.svg')] }, { layers: [L('b.svg')] }]),
      'light',
      NO_FX,
    );
    checkReferences(t);
    const root = parse(t);
    // paint order: last group first (design 004 E3) → l1 = b.svg (group 2), l2 = b.svg, l3 = a.svg
    const grads = [...root.querySelectorAll('linearGradient[id$="-g"]')].map((g) => [
      g.id,
      g.querySelector('stop')!.getAttribute('stop-color'),
    ]);
    expect(grads).toEqual([
      ['l1-g', '#00f'],
      ['l2-g', '#00f'],
      ['l3-g', '#f00'],
    ]);
    const rects = root.querySelectorAll('rect[fill^="url"]');
    expect([...rects].map((r) => r.getAttribute('fill'))).toEqual([
      'url(#ai-export-fill)',
      'url(#l1-g)',
      'url(#l2-g)',
      'url(#l3-g)',
    ]);
    expect(t).toContain('stroke:url(&quot;#l3-g&quot;)');
    expect(t).toContain('xlink:href="#l3-r"');
    expect(t).toContain('href="#l1-r"');
  });

  it('clip paths go along with prefixed ids, also in two layers (design 014 E11)', () => {
    const clipped =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>' +
      '<clipPath id="clip" clipPathUnits="objectBoundingBox"><rect width="1" height="0.5"/></clipPath></defs>' +
      '<g clip-path="url(#clip)"><rect width="100" height="100" style="clip-path:url(#clip)"/></g></svg>';
    const t = exportSvg(
      doc([{ layers: [L('c.svg'), L('c.svg')] }], {}, { 'c.svg': clipped }),
      'light',
      NO_FX,
    );
    checkReferences(t);
    const root = parse(t);
    expect([...root.querySelectorAll('clipPath')].map((c) => c.id)).toEqual(['l1-clip', 'l2-clip']);
    expect(root.querySelector('clipPath')!.getAttribute('clipPathUnits')).toBe('objectBoundingBox');
    expect(
      [...root.querySelectorAll('g[clip-path]')].map((g) => g.getAttribute('clip-path')),
    ).toEqual(['url(#l1-clip)', 'url(#l2-clip)']);
  });

  it('prefixIds also rewrites url() in <style> text', () => {
    const root = parse(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:url(#p)} #p{opacity:1}</style>' +
        '<pattern id="p"/><rect class="a"/></svg>',
    );
    prefixIds(root, 'l9-');
    expect(root.querySelector('style')!.textContent).toBe('.a{fill:url(#l9-p)} #l9-p{opacity:1}');
    expect(root.querySelector('pattern')!.id).toBe('l9-p');
  });

  it('group and layer opacity, position and hidden layers', () => {
    const t = exportSvg(
      doc([
        {
          opacity: 0.5,
          layers: [
            L('a.svg', { opacity: 0.25, position: { scale: 2, 'translation-in-points': [10, 0] } }),
            L('b.svg', { hidden: true }),
          ],
        },
      ]),
      'light',
      NO_FX,
    );
    const root = parse(t);
    const group = root.querySelector('g.ai-export-group')!;
    expect(group.getAttribute('opacity')).toBe('0.5');
    const layers = group.querySelectorAll(':scope > g.ai-export-layer');
    expect(layers).toHaveLength(1);
    expect(layers[0].getAttribute('opacity')).toBe('0.25');
    expect(layers[0].getAttribute('transform')).toBe(
      'translate(522 512) scale(2) translate(-512 -512)',
    );
  });

  it('platform mask: squircle, circle or none', () => {
    const d = doc([{ layers: [L('a.svg')] }]);
    const sq = parse(exportSvg(d, 'light', { mask: 'squircle', effects: false }));
    expect(sq.querySelector('clipPath#ai-export-mask path')!.getAttribute('d')).toBe(
      squirclePath(),
    );
    expect(sq.querySelector(':scope > g')!.getAttribute('clip-path')).toBe('url(#ai-export-mask)');
    const ci = parse(exportSvg(d, 'light', { mask: 'circle', effects: false }));
    const c = ci.querySelector('clipPath#ai-export-mask circle')!;
    expect([c.getAttribute('cx'), c.getAttribute('cy'), c.getAttribute('r')]).toEqual([
      '512',
      '512',
      '512',
    ]);
    expect(parse(exportSvg(d, 'light', NO_FX)).querySelector('clipPath')).toBeNull();
  });

  it('background fills as sRGB hex + opacity (resvg knows no color())', () => {
    const solid = parse(
      exportSvg(doc([], { fill: { solid: 'display-p3:0.5,0.5,0.5,0.5' } }), 'light', NO_FX),
    );
    const bg = solid.querySelector('rect.ai-export-background')!;
    expect([bg.getAttribute('fill'), bg.getAttribute('fill-opacity')]).toEqual(['#808080', '0.5']);
    const lin = parse(
      exportSvg(
        doc([], {
          fill: {
            'linear-gradient': ['srgb:1,0,0,1', 'srgb:0,0,1,1'],
            orientation: { start: { x: 0, y: 0 }, stop: { x: 1, y: 1 } },
          },
        }),
        'light',
        NO_FX,
      ),
    );
    const g = lin.querySelector('linearGradient#ai-export-fill')!;
    expect(['x1', 'y1', 'x2', 'y2'].map((a) => g.getAttribute(a))).toEqual(['0', '0', '1', '1']);
    expect([...g.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color'))).toEqual([
      '#ff0000',
      '#0000ff',
    ]);
    expect(lin.querySelector('rect.ai-export-background')!.getAttribute('fill')).toBe(
      'url(#ai-export-fill)',
    );
    const rad = parse(
      exportSvg(
        doc([], { fill: { 'radial-gradient': ['srgb:1,1,1,1', 'srgb:0,0,0,1'] } }),
        'dark',
        NO_FX,
      ),
    );
    const r = rad.querySelector('radialGradient#ai-export-fill')!;
    expect(['cx', 'cy', 'r'].map((a) => r.getAttribute(a))).toEqual(['0.5', '0.5', '0.75']);
    // automatic follows the appearance; "none" paints no background
    const auto = parse(exportSvg(doc([]), 'dark', NO_FX));
    expect(auto.querySelector('#ai-export-fill stop')!.getAttribute('stop-color')).toBe('#3a3a3c');
    expect(
      parse(exportSvg(doc([], { fill: 'none' }), 'light', NO_FX)).querySelector('rect'),
    ).toBeNull();
  });

  it('effects on: shadow filter per layer, translucency mask, blend modes; off: none of it', () => {
    const groups = [
      {
        shadow: { kind: 'neutral', opacity: 0.5 },
        translucency: { enabled: true, value: 0.4 },
        'blend-mode': 'multiply',
        layers: [L('a.svg', { 'blend-mode': 'screen' })],
      },
    ];
    const on = parse(exportSvg(doc(groups), 'light', { mask: 'none', effects: true }));
    const layer = on.querySelector('g.ai-export-layer')!;
    const filterId = /url\(#(.+)\)/.exec(layer.getAttribute('filter')!)![1];
    expect(on.querySelector(`filter#${filterId} feDropShadow`)).not.toBeNull();
    expect(on.querySelector(`filter#${filterId}`)!.hasAttribute('data-kind')).toBe(false);
    expect(layer.getAttribute('style')).toBe('mix-blend-mode:screen');
    const group = on.querySelector('g.ai-export-group')!;
    expect(group.getAttribute('style')).toBe('mix-blend-mode:multiply;isolation:isolate');
    const maskId = /url\(#(.+)\)/.exec(group.getAttribute('mask')!)![1];
    const mask = on.querySelector(`mask#${maskId}`)!;
    expect(mask.getAttribute('mask-type')).toBe('alpha');
    const stops = [...on.querySelectorAll(`#${maskId}-gradient stop`)].map((s) =>
      s.getAttribute('stop-opacity'),
    );
    expect(stops).toEqual(['1', '0.8']);
    const off = exportSvg(doc(groups), 'light', NO_FX);
    for (const s of ['<filter', '<mask', 'mix-blend-mode']) expect(off).not.toContain(s);
  });

  it('PNG assets as <image>, natural size centred (full canvas when unknown)', () => {
    const d = doc([{ layers: [L('p.png')] }]);
    const known = parse(
      exportSvg(d, 'light', NO_FX, new Map([['p.png', { width: 200, height: 100 }]])),
    );
    const img = known.querySelector('image')!;
    expect(['x', 'y', 'width', 'height', 'href'].map((a) => img.getAttribute(a))).toEqual([
      '412',
      '462',
      '200',
      '100',
      'data:image/png;base64,AAAA',
    ]);
    const unknown = parse(exportSvg(d, 'light', NO_FX)).querySelector('image')!;
    expect(unknown.getAttribute('width')).toBe('1024');
  });

  it('all-fields.icon exports in both appearances with valid references', () => {
    const d = allFieldsDocument();
    for (const a of ['light', 'dark'] as const) {
      const t = exportSvg(d, a, { mask: 'squircle', effects: true });
      checkReferences(t);
      expect(t).not.toContain('data-ai-');
    }
  });
});
