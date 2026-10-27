import { describe, expect, it } from 'vitest';
import { checkSource, offsetOf, parseErrorPosition } from './svg-source-check';

const NS = 'xmlns="http://www.w3.org/2000/svg"';

describe('parseErrorPosition', () => {
  it('reads the messages of Chromium / WebKit, Firefox and jsdom', () => {
    expect(
      parseErrorPosition(
        'This page contains the following errors:error on line 3 at column 7: Opening and ending tag mismatch: g line 2 and svg Below is a rendering of the page up to the first error.',
      ),
    ).toEqual({ line: 3, column: 7, detail: 'Opening and ending tag mismatch: g line 2 and svg' });
    expect(
      parseErrorPosition(
        'XML Parsing Error: mismatched tag. Expected: </g>.\nLocation: about:blank\nLine Number 2, Column 5:',
      ),
    ).toEqual({ line: 2, column: 5, detail: 'mismatched tag. Expected: </g>.' });
    expect(parseErrorPosition('1:49: unexpected close tag.')).toEqual({
      line: 1,
      column: 49,
      detail: 'unexpected close tag.',
    });
    expect(parseErrorPosition('something else')).toEqual({
      line: 1,
      column: 1,
      detail: 'something else',
    });
  });
});

describe('checkSource', () => {
  it('accepts a valid asset and a valid node', () => {
    expect(checkSource(`<svg ${NS}><rect/></svg>`, 'asset')).toBeNull();
    expect(checkSource('<g>\n  <rect fill="red"/>\n</g>\n', 'node')).toBeNull();
  });

  it('reports the position of a syntax error', () => {
    const p = checkSource(`<svg ${NS}>\n  <rect x="1"\n  <g/>\n</svg>`, 'asset')!;
    expect(p.kind).toBe('syntax');
    expect(p.line).toBe(3);
  });

  it('shifts the column of a node error on the first line back (wrapper)', () => {
    const p = checkSource('<rect x="1"/></g>', 'node')!;
    expect(p).toMatchObject({ kind: 'syntax', line: 1 });
    expect(p.column).toBeLessThanOrEqual(18);
  });

  it('wants an svg root for an asset and exactly one element for a node', () => {
    expect(checkSource('<g xmlns="http://www.w3.org/2000/svg"/>', 'asset')).toMatchObject({
      kind: 'root',
      line: 1,
      column: 1,
    });
    expect(checkSource('<svg><rect/></svg>', 'asset')?.kind).toBe('root'); // no namespace
    expect(checkSource('<rect/>\n<circle r="1"/>', 'node')).toMatchObject({
      kind: 'count',
      line: 2,
      column: 1,
    });
    expect(checkSource('<!-- only -->', 'node')?.kind).toBe('count');
    expect(checkSource('  \n', 'node')?.kind).toBe('empty');
  });
});

describe('offsetOf', () => {
  it('maps line / column to an offset, clamped', () => {
    const t = 'ab\ncdef\ng';
    expect(offsetOf(t, 1, 1)).toBe(0);
    expect(offsetOf(t, 2, 3)).toBe(5);
    expect(offsetOf(t, 2, 99)).toBe(7);
    expect(offsetOf(t, 9, 1)).toBe(t.length);
  });
});
