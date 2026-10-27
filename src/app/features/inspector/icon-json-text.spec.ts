import { describe, expect, it } from 'vitest';
import { CAMSCANNER_ICON } from '../../../testing/fixtures/camscanner-icon';
import { changedLines, formatIconJson } from './icon-json-text';

describe('icon-json-text (design 010 E12)', () => {
  it('formats the real Icon Composer file byte for byte', () => {
    expect(formatIconJson(JSON.parse(CAMSCANNER_ICON.iconJson))).toBe(CAMSCANNER_ICON.iconJson);
  });

  it('empty lists like Icon Composer, empty objects as {}', () => {
    expect(formatIconJson({ fill: 'none', groups: [], x: {} })).toBe(
      '{\n  "fill" : "none",\n  "groups" : [\n\n  ],\n  "x" : {}\n}',
    );
    expect(formatIconJson({ a: 1.5, b: null, c: 'ä/"' })).toBe(
      '{\n  "a" : 1.5,\n  "b" : null,\n  "c" : "ä/\\""\n}',
    );
  });

  it('changed lines: common start and end removed', () => {
    expect(changedLines('a\nb\nc', 'a\nb\nc')).toBeNull();
    expect(changedLines('a\nb\nc', 'a\nX\nc')).toEqual({ from: 1, to: 2 });
    expect(changedLines('a\nc', 'a\nX\nY\nc')).toEqual({ from: 1, to: 3 });
    expect(changedLines('a\nb\nc', 'a\nc')).toEqual({ from: 0, to: 1 });
    expect(changedLines('', 'x')).toEqual({ from: 0, to: 1 });
  });
});
