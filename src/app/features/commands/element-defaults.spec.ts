import { checkArgs } from '../../core/actions/action-args';
import { shapeArgsSpec } from '../../core/actions/add-action-args';
import { MAX_NODE_MARKUP } from '../document/commands/registry';
import { IMAGE_ARGS } from '../../core/actions/add-action-args';
import { allowedAttribute, applyShapeArgs, parseRef } from './add-args';
import {
  buildElement,
  defaultShape,
  fitImage,
  imageSpec,
  ShapeKind,
  TEXT_FONT,
} from './element-defaults';

const c = { x: 500, y: 400 };

describe('default geometry (design 008 E5, legacy §8) with a thin line (design 019 E13)', () => {
  it.each<[ShapeKind, string]>([
    ['container', '<g/>'],
    ['circle', '<circle cx="500" cy="400" r="128" fill="none" stroke="#000000" stroke-width="2"/>'],
    [
      'ellipse',
      '<ellipse cx="500" cy="400" rx="160" ry="120" fill="none" stroke="#000000" stroke-width="2"/>',
    ],
    [
      'rect',
      '<rect x="372" y="272" width="256" height="256" fill="none" stroke="#000000" stroke-width="2"/>',
    ],
    [
      'path',
      '<path d="M 500,260 L 360,540 L 640,540 Z" fill="none" stroke="#000000" stroke-width="2"/>',
    ],
    [
      'line',
      '<line x1="340" y1="400" x2="660" y2="400" fill="none" stroke="#000000" stroke-width="2"/>',
    ],
    [
      'polyline',
      '<polyline points="340,520 500,260 660,520" fill="none" stroke="#000000" stroke-width="2"/>',
    ],
    [
      'polygon',
      '<polygon points="500,240 340,520 660,520" fill="none" stroke="#000000" stroke-width="2"/>',
    ],
    [
      'text',
      `<text x="500" y="456" font-family="${TEXT_FONT.replaceAll("'", '&apos;')}" font-size="160" font-weight="400" text-anchor="middle" fill="#000000">Text</text>`,
    ],
  ])('%s', (kind, markup) => {
    const out = buildElement(defaultShape(kind, c)).replace(
      ' xmlns="http://www.w3.org/2000/svg"',
      '',
    );
    expect(out.replace(/&apos;/g, "'")).toBe(markup.replace(/&apos;/g, "'"));
  });

  it('takes the remembered paint of its kind', () => {
    const s = defaultShape('rect', c, { fill: '#ff0000', 'stroke-dasharray': '4 2' });
    expect(s.attrs).toEqual({
      x: '372',
      y: '272',
      width: '256',
      height: '256',
      fill: '#ff0000',
      'stroke-dasharray': '4 2',
    });
  });

  it('rounds to at most four decimals', () => {
    expect(defaultShape('circle', { x: 1 / 3, y: 2 }).attrs['cx']).toBe('0.3333');
  });

  it('fits images only smaller, keeping the aspect ratio', () => {
    expect(fitImage(100, 50)).toEqual({ width: 100, height: 50 });
    expect(fitImage(2048, 1024)).toEqual({ width: 512, height: 256 });
    expect(fitImage(300, 1200)).toEqual({ width: 128, height: 512 });
    expect(fitImage(0, 0)).toEqual({ width: 512, height: 512 });
    const img = imageSpec('data:image/png;base64,AA', c, 100, 50);
    expect(img.attrs).toMatchObject({ x: '450', y: '375', width: '100', height: '50' });
  });

  it('escapes values – markup cannot break out', () => {
    const m = buildElement({ tag: 'text', attrs: { fill: '"/><script/>' }, text: '<b>&' });
    expect(m).not.toContain('<script');
    expect(m).toContain('&lt;b&gt;&amp;');
  });
});

describe('add arguments (design 008 E6)', () => {
  const base = defaultShape('circle', c);
  it('takes geometry, paint and free attributes', () => {
    const s = applyShapeArgs('circle', base, {
      cx: 10,
      r: 5.123456,
      fill: 'red',
      strokeWidth: 2,
      attributes: { 'stroke-dasharray': '4 2', 'xlink:title': 't' },
    })!;
    expect(s.attrs).toEqual({
      cx: '10',
      cy: '400',
      r: '5.1235',
      fill: 'red',
      stroke: '#000000',
      'stroke-width': '2',
      'stroke-dasharray': '4 2',
      'xlink:title': 't',
    });
  });

  it('keeps a rect centred when only its size is given; text and font', () => {
    const r = applyShapeArgs('rect', defaultShape('rect', c), { width: 100 })!;
    expect(r.attrs).toMatchObject({ x: '450', width: '100', y: '272' });
    const t = applyShapeArgs('text', defaultShape('text', c), { text: 'Hi', fontSize: 40 })!;
    expect(t.text).toBe('Hi');
    expect(t.attrs['font-size']).toBe('40');
  });

  it('refuses handlers, internal attributes and odd values', () => {
    for (const attributes of [
      { onclick: 'x()' },
      { 'data-ai-id': 'n1' },
      { 'bad name': 'x' },
      { fill: 3 },
      [],
      Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`a${i}`, 'x'])),
    ]) {
      expect(applyShapeArgs('circle', base, { attributes })).toBeNull();
    }
    expect(allowedAttribute('ONLOAD')).toBe(false);
    expect(parseRef({ asset: 'a.svg', id: 'n1' })).toEqual({ asset: 'a.svg', id: 'n1' });
    expect(parseRef({ asset: 'a.svg', id: 'x' })).toBeNull();
    expect(parseRef({ asset: 'a.svg', id: 'n1', more: 1 })).toBeNull();
    expect(parseRef(undefined)).toBeUndefined();
  });

  it('has a schema the action service checks', () => {
    const spec = shapeArgsSpec('circle');
    expect(checkArgs(spec, { cx: 1, cy: 2, r: 3, fill: '#fff' })).toBe(true);
    expect(checkArgs(spec, { cx: '1' })).toBe(false);
    expect(checkArgs(spec, { d: 'M0 0' })).toBe(false);
    expect(checkArgs(spec, undefined)).toBe(true);
    expect(checkArgs(shapeArgsSpec('container'), { fill: 'red' })).toBe(false);
    // the image fits through `insertNode` (design 008 E8)
    const href = IMAGE_ARGS.properties['href'];
    expect(href.type === 'string' && href.maxLength! < MAX_NODE_MARKUP).toBe(true);
  });
});
