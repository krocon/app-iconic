import { describe, expect, it } from 'vitest';
import { lineDiff } from './line-diff';

const show = (a: string | null, b: string | null) =>
  lineDiff(a, b).map((l) => (l.kind === 'same' ? ' ' : l.kind === 'add' ? '+' : '-') + l.text);

describe('lineDiff', () => {
  it('marks added and removed lines around common ones', () => {
    const a = '{\n  "mcpServers": {\n    "x": {}\n  }\n}\n';
    const b = '{\n  "mcpServers": {\n    "x": {},\n    "app-iconic": {}\n  }\n}\n';
    expect(show(a, b)).toEqual([
      ' {',
      '   "mcpServers": {',
      '-    "x": {}',
      '+    "x": {},',
      '+    "app-iconic": {}',
      '   }',
      ' }',
    ]);
  });

  it('a new file is all added, a removed one all removed, equal texts all kept', () => {
    expect(show(null, 'a\nb\n')).toEqual(['+a', '+b']);
    expect(show('a\nb', '')).toEqual(['-a', '-b']);
    expect(show('a\nb\n', 'a\nb\n')).toEqual([' a', ' b']);
  });

  it('finds the common lines in the middle (LCS)', () => {
    expect(show('a\nx\nb\ny\nc', 'a\nb\nz\nc')).toEqual([' a', '-x', ' b', '-y', '+z', ' c']);
  });

  it('stays fast for big inputs', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n');
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n');
    const d = lineDiff(a, b);
    expect(d).toHaveLength(6000);
    expect(d[0]).toEqual({ kind: 'del', text: 'a0' });
  });
});
