import { follow, partnerOf } from './constrain';
import {
  colorKind,
  nativeValue,
  normalizeHex,
  parseHex,
  parseRgbFunction,
  toHex,
  toRgba,
  urlId,
  withPicked,
} from '../../shared/controls/color-value';
import { combine } from './mixed';
import {
  ALL_PROPERTIES,
  bySection,
  commonSpec,
  PRESERVE_ASPECT_RATIO,
  SECTIONS,
  specFor,
  SPEC_TAGS,
} from './property-spec';

const names = (tag: string) => specFor(tag).map((d) => d.name);
const byName = (tag: string, name: string) => specFor(tag).find((d) => d.name === name)!;

describe('property spec (design 009 E1)', () => {
  it('every element type has its geometry', () => {
    const geometry: Record<string, string[]> = {
      rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
      circle: ['cx', 'cy', 'r'],
      ellipse: ['cx', 'cy', 'rx', 'ry'],
      line: ['x1', 'y1', 'x2', 'y2'],
      polyline: ['points'],
      polygon: ['points'],
      path: ['d'],
      text: ['x', 'y'],
      image: ['x', 'y', 'width', 'height'],
      use: ['x', 'y', 'width', 'height', 'href'],
      svg: ['x', 'y', 'width', 'height', 'viewBox'],
      g: [],
      stop: ['offset'],
    };
    for (const [tag, geo] of Object.entries(geometry)) {
      expect(
        specFor(tag)
          .filter((d) => d.section === 'geometry')
          .map((d) => d.name),
        tag,
      ).toEqual(geo);
    }
  });

  it('contains every attribute of legacy §7.4 (except the clip path, prompt 014)', () => {
    const all = new Set(ALL_PROPERTIES.map((d) => d.name));
    for (const n of [
      'fill',
      'fill-opacity',
      'stroke',
      'stroke-opacity',
      'stroke-width',
      'opacity',
      'transform',
      'id',
      'display',
      'visibility',
      'vector-effect',
      'text',
      'font-size',
      'font-family',
      'font-weight',
      'text-decoration',
      'x',
      'y',
      'width',
      'height',
      'rx',
      'ry',
      'cx',
      'cy',
      'r',
      'x1',
      'y1',
      'x2',
      'y2',
      'd',
      'points',
      'fill-rule',
      'filter',
      'mask',
      'stroke-dasharray',
      'stroke-dashoffset',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-miterlimit',
      'preserveAspectRatio',
    ]) {
      expect(all.has(n), n).toBe(true);
    }
  });

  it('ranges, steps and defaults of the template', () => {
    expect(byName('rect', 'stroke-width')).toMatchObject({ min: 0, max: 100 });
    expect(byName('text', 'font-size')).toMatchObject({ min: 4, max: 512 });
    expect(byName('rect', 'opacity')).toMatchObject({ min: 0, max: 1, step: 0.01, default: '1' });
    expect(byName('rect', 'stroke-miterlimit')).toMatchObject({ min: 1, max: 100, default: '4' });
    expect(byName('rect', 'fill-rule').options).toEqual(['nonzero', 'evenodd']);
    expect(byName('rect', 'stroke-linecap').options).toEqual(['butt', 'round', 'square']);
    expect(byName('rect', 'stroke-linejoin').options).toEqual(['miter', 'round', 'bevel']);
    expect(byName('rect', 'width')).toMatchObject({ min: 0, max: 10000, reset: false });
    expect(byName('rect', 'rx')).toMatchObject({ min: 0, max: 1000, reset: true });
    expect(byName('circle', 'r')).toMatchObject({ min: 0, max: 10000 });
    expect(byName('path', 'd').type).toBe('textarea');
    expect(byName('polygon', 'points').type).toBe('textarea');
    expect(byName('image', 'preserveAspectRatio').options).toBe(PRESERVE_ASPECT_RATIO);
    expect(PRESERVE_ASPECT_RATIO).toHaveLength(19);
    expect(byName('svg', 'preserveAspectRatio')).toBeTruthy();
    expect(byName('rect', 'vector-effect')).toMatchObject({
      type: 'toggle',
      on: 'non-scaling-stroke',
    });
  });

  it('no name twice in a spec; text properties only for text; unknown tags get the id', () => {
    for (const tag of SPEC_TAGS) expect(new Set(names(tag)).size, tag).toBe(names(tag).length);
    expect(names('rect')).not.toContain('font-size');
    expect(names('text')).toContain('font-size');
    expect(names('text')).toContain('text');
    expect(names('linearGradient')).toEqual(['id']);
    expect(names('clipPath')).toEqual(['id']);
    // every section is known and in order
    const secs = bySection(specFor('text')).map((s) => s.section);
    expect(secs).toEqual(SECTIONS.filter((s) => secs.includes(s)));
    expect(secs).toEqual(['geometry', 'appearance', 'stroke', 'text', 'transform', 'advanced']);
  });

  it('a multiple selection shows the properties all of them have (design 009 E5)', () => {
    const c = commonSpec(['rect', 'circle']).map((d) => d.name);
    expect(c).not.toContain('width');
    expect(c).not.toContain('r');
    expect(c).toContain('fill');
    expect(c).toContain('transform');
    expect(commonSpec(['rect', 'ellipse']).map((d) => d.name)).toContain('rx');
    expect(commonSpec(['rect', 'stop']).map((d) => d.name)).toEqual(['id']);
    expect(commonSpec([])).toEqual([]);
  });
});

describe('mixed values (design 009 E5)', () => {
  it('same, mixed, none', () => {
    expect(combine([])).toEqual({ kind: 'none' });
    expect(combine(['1', '1'])).toEqual({ kind: 'same', value: '1' });
    expect(combine([null, null])).toEqual({ kind: 'same', value: null });
    expect(combine(['1', '2'])).toEqual({ kind: 'mixed' });
    expect(combine(['1', null])).toEqual({ kind: 'mixed' });
  });
});

describe('constrain proportions (design 009 E6)', () => {
  it('the partner follows in the ratio before the edit', () => {
    expect(partnerOf('width')).toBe('height');
    expect(partnerOf('ry')).toBe('rx');
    expect(partnerOf('x')).toBeNull();
    expect(follow(200, 100, 50)).toBe(100);
    expect(follow(30, 10, 10)).toBe(30);
    expect(follow(30, 0, 10)).toBeNull();
    expect(follow(30, 10, null)).toBeNull();
    expect(follow(30, 10, 0)).toBeNull();
  });
});

describe('colour values (design 009 E10)', () => {
  it('hex 3/4/6/8 digits (CSS order #RRGGBBAA)', () => {
    expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseHex('00ff00')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseHex('#0000ff80')!.a).toBeCloseTo(128 / 255);
    expect(parseHex('#0008')!.a).toBeCloseTo(136 / 255);
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('#ggg')).toBeNull();
    expect(toHex({ r: 255, g: 16, b: 0, a: 1 })).toBe('#FF1000');
    expect(toHex({ r: 255, g: 16, b: 0, a: 0.5 })).toBe('#FF100080');
    expect(normalizeHex('abc')).toBe('#AABBCC');
    expect(normalizeHex(' #AbCdEf12 ')).toBe('#ABCDEF12');
    expect(normalizeHex('red')).toBeNull();
  });

  it('kinds, references and keywords', () => {
    expect(colorKind('none')).toBe('none');
    expect(colorKind('currentColor')).toBe('keyword');
    expect(colorKind('inherit')).toBe('keyword');
    expect(colorKind('url(#g1)')).toBe('url');
    expect(urlId("url('#g1')")).toBe('g1');
    expect(urlId('red')).toBeNull();
    expect(colorKind('#fff')).toBe('hex');
    expect(colorKind('red')).toBe('other');
    expect(colorKind('rgb(1,2,3)')).toBe('other');
  });

  it('rgb() and the value of the native picker', () => {
    expect(parseRgbFunction('rgb(255, 0, 10)')).toEqual({ r: 255, g: 0, b: 10, a: 1 });
    expect(parseRgbFunction('rgba(0,0,0,0.5)')!.a).toBe(0.5);
    expect(parseRgbFunction('rgb(100% 0% 0% / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(nativeValue('#ABCDEF80')).toBe('#abcdef');
    expect(nativeValue('rgb(255, 0, 0)')).toBe('#ff0000');
    expect(nativeValue('none')).toBe('#000000');
    expect(nativeValue('red', () => '#ff0000')).toBe('#ff0000');
    expect(toRgba('url(#a)', () => '#ffffff')).toBeNull();
    expect(withPicked('#00000080', '#ff0000')).toBe('#FF000080');
    expect(withPicked('red', '#00ff00')).toBe('#00FF00');
  });
});
