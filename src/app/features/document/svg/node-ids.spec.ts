import { SVG_FIXTURES } from '../../../../testing/fixtures/svg-fixtures';
import { CAMSCANNER_ICON } from '../../../../testing/fixtures/camscanner-icon';
import {
  assignIds,
  elementsOf,
  ID_ATTR,
  parseFragment,
  parseSvg,
  serializeAsset,
  serializeElement,
} from './node-ids';

const counter = () => {
  let n = 0;
  return () => `n${++n}`;
};

describe('node-ids', () => {
  it('gives every element a unique id and leaves none in the serialisation', () => {
    const svg = parseSvg(SVG_FIXTURES.find((f) => f.name === 'nested_g.svg')!.text)!;
    const before = serializeAsset(svg);
    assignIds(svg.doc.documentElement, counter());
    const ids = elementsOf(svg.doc.documentElement).map((e) => e.getAttribute(ID_ATTR));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('n1');
    expect(serializeAsset(svg)).toBe(before);
    expect(serializeAsset(svg)).not.toContain('data-ai-');
  });

  it.each([...SVG_FIXTURES, ...CAMSCANNER_ICON.assets].map((f) => [f.name, f.text]))(
    'round-trips %s without change through ids',
    (_name, text) => {
      const plain = parseSvg(text)!;
      const withIds = parseSvg(text)!;
      assignIds(withIds.doc.documentElement, counter());
      expect(serializeAsset(withIds)).toBe(serializeAsset(plain));
    },
  );

  it('keeps the XML declaration and the final newline', () => {
    const text =
      '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>\n';
    const svg = parseSvg(text)!;
    expect(svg.head).toBe('<?xml version="1.0" encoding="UTF-8"?>\n');
    expect(serializeAsset(svg)).toBe(text);
  });

  it('rejects broken markup and other roots', () => {
    expect(parseSvg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')).toBeNull();
    expect(parseSvg('<html/>')).toBeNull();
    expect(parseSvg('<svg/>')).toBeNull();
  });

  it('parses fragments in the SVG namespace', () => {
    const el = parseFragment('<rect width="1" xlink:href="#a"/>')!;
    expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(serializeElement(el)).toContain('<rect');
    expect(parseFragment('<rect/><rect/>')).toBeNull();
    expect(parseFragment('<rect')).toBeNull();
  });
});
