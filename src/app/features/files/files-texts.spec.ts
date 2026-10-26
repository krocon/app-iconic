import { describeNotices } from './files-texts';

describe('files-texts', () => {
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
