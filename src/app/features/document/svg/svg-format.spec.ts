import { describe, expect, it } from 'vitest';
import { SVG_FIXTURES } from '../../../../testing/fixtures/svg-fixtures';
import {
  formatElement,
  formatFragment,
  formatPathData,
  formatSvg,
  roundNumbers,
} from './svg-format';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

/** Elements with their attributes (name → value), in document order. */
function structure(markup: string) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  return Array.from(doc.querySelectorAll('*')).map((el) => ({
    tag: el.nodeName,
    attrs: Object.fromEntries(Array.from(el.attributes).map((a) => [a.name, a.value])),
    text: Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.CDATA_SECTION_NODE)
      .map((n) => (n as Text).data)
      .join('')
      .trim(),
  }));
}

describe('formatSvg', () => {
  it('indents by 2, one element per line, attributes in a stable order, numbers rounded', () => {
    const input =
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- logo --><svg viewBox="0 0 1024.00001 1024" ${NS}>` +
      `<g fill="red" transform="translate(10.12345 -0.0001)" id="g1">` +
      `<rect fill="#00f" height="20.5555" width="10" y="2" x="1.23456"/>` +
      `<path stroke-width="1.33333" d="M0.12345 0 l10.00049 -0.0002 a5 5 0 0110 0z"/>` +
      `</g></svg>`;
    expect(formatSvg(input)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!-- logo -->',
        `<svg ${NS} viewBox="0 0 1024 1024">`,
        '  <g id="g1" transform="translate(10.123 0)" fill="red">',
        '    <rect x="1.235" y="2" width="10" height="20.556" fill="#00f"/>',
        '    <path d="M0.123 0 l10.001 0 a5 5 0 0 1 10 0 z" stroke-width="1.333"/>',
        '  </g>',
        '</svg>',
        '',
      ].join('\n'),
    );
  });

  it('keeps text, CDATA and comments character for character', () => {
    const input =
      `<svg ${NS}><style><![CDATA[ .a { fill: red } ]]></style>` +
      `<text x="1.23456">Hello  <tspan fill="red">big</tspan> world</text><!-- note --></svg>`;
    const out = formatSvg(input)!;
    expect(out).toContain('<style><![CDATA[ .a { fill: red } ]]></style>');
    expect(out).toContain('<text x="1.235">Hello  <tspan fill="red">big</tspan> world</text>');
    expect(out).toContain('  <!-- note -->');
  });

  it('does not break elements with xml:space="preserve"', () => {
    const input = `<svg ${NS}><g xml:space="preserve"> <rect/> <rect/> </g></svg>`;
    expect(formatSvg(input)).toContain('<g xml:space="preserve"> <rect/> <rect/> </g>');
  });

  it('leaves numbers alone with precision null and outside numeric attributes', () => {
    const input = `<svg ${NS}><rect id="a1.23456" x="1.23456" style="stroke-width:1.23456"/></svg>`;
    expect(formatSvg(input, { precision: null })).toContain(
      '<rect id="a1.23456" x="1.23456" style="stroke-width:1.23456"/>',
    );
    expect(formatSvg(input)).toContain(
      '<rect id="a1.23456" x="1.235" style="stroke-width:1.23456"/>',
    );
  });

  it('escapes attribute values and text', () => {
    const input = `<svg ${NS}><text data-x="a&amp;&quot;&lt;">a &lt; b &amp; c</text></svg>`;
    expect(formatSvg(input)).toContain('<text data-x="a&amp;&quot;&lt;">a &lt; b &amp; c</text>');
  });

  it('returns null for markup that is not well-formed', () => {
    expect(formatSvg('<svg><g></svg>')).toBeNull();
  });

  describe.each(SVG_FIXTURES.map((f) => [f.name, f.text]))('fixture %s', (_name, text) => {
    it('is idempotent', () => {
      const once = formatSvg(text)!;
      expect(formatSvg(once)).toBe(once);
    });

    it('keeps elements, attributes and text (precision null)', () => {
      expect(structure(formatSvg(text, { precision: null })!)).toEqual(structure(text));
    });
  });
});

describe('roundNumbers / formatPathData', () => {
  it('rounds every number, -0 and tiny values become 0', () => {
    expect(roundNumbers('matrix(1,0,0,1,-0.00001,1e-7) 12.34567px', 2)).toBe(
      'matrix(1,0,0,1,0,0) 12.35px',
    );
  });

  it('keeps commands and arc flags of path data', () => {
    expect(formatPathData('M10.1234,20 L30.98765,40 a1 1 0 0110 10 Z', 1)).toBe(
      'M10.1 20 L31 40 a1 1 0 0 1 10 10 Z',
    );
    expect(formatPathData('not a path', 2)).toBe('not a path');
  });

  it('keeps implicit repetition', () => {
    expect(formatPathData('M0 0 L1.111 1 2.222 2 3 3', 1)).toBe('M0 0 L1.1 1 2.2 2 3 3');
  });
});

describe('formatElement', () => {
  it('formats one element without internal attributes, with its namespace', () => {
    const doc = new DOMParser().parseFromString(
      `<svg ${NS}><g data-ai-id="n2"><circle data-ai-id="n3" r="5.55555" cx="1"/></g></svg>`,
      'image/svg+xml',
    );
    const g = doc.querySelector('g')!;
    expect(formatElement(g)).toBe(`<g ${NS}>\n  <circle cx="1" r="5.556"/>\n</g>\n`);
  });
});

describe('formatFragment', () => {
  it('formats a node with xlink but without declarations', () => {
    expect(formatFragment('<g><use xlink:href="#a" x="1.23456"/></g>', { precision: 2 })).toBe(
      '<g>\n  <use x="1.23" xlink:href="#a"/>\n</g>',
    );
    expect(formatFragment('<g>')).toBeNull();
  });
});
