import { describeNotices, platformHint } from './files-texts';

describe('files-texts', () => {
  it('writes shortcut hints per platform', () => {
    expect(platformHint('Save As… (⇧⌘S)', true)).toBe('Save As… (⇧⌘S)');
    expect(platformHint('Save As… (⇧⌘S)', false)).toBe('Save As… (Ctrl+Shift+S)');
    expect(platformHint('Open… (⌘O)', false)).toBe('Open… (Ctrl+O)');
  });

  it('describes notices in one line', () => {
    expect(describeNotices([])).toBeNull();
    expect(
      describeNotices([
        { code: 'missing_asset', name: 'a.svg' },
        { code: 'script', name: 'b.svg' },
      ]),
    ).toBe('a.svg: missing image · b.svg: removed scripts');
  });
});
