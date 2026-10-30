import { describeFsError, toFsError } from './fs-error';

describe('fs-error', () => {
  it('keeps known codes', () => {
    expect(toFsError({ code: 'not_found', message: 'x', path: '/a' }).code).toBe('not_found');
  });

  it('maps unknown codes and other values to unknown', () => {
    expect(toFsError({ code: 'what', message: 'x' }).code).toBe('unknown');
    expect(toFsError(new Error('boom'))).toEqual({ code: 'unknown', message: 'boom' });
    expect(toFsError('plain').message).toBe('plain');
  });

  it('knows the .icon codes of prompt 002', () => {
    for (const code of [
      'invalid_icon',
      'unsupported_icon',
      'too_large',
      'missing_asset',
      'invalid_svg',
      'invalid_menu',
      'invalid_image',
      'already_exists',
      'invalid_text',
      'missing_glyphs',
    ] as const) {
      const e = toFsError({ code, message: 'rust text' });
      expect(e.code).toBe(code);
      expect(describeFsError(e)).not.toContain('rust text');
      expect(describeFsError(e)).not.toBe(describeFsError({ code: 'unknown', message: '' }));
    }
  });

  it('knows not_allowed of the path rule (prompt 033 E1), in English and German', () => {
    const e = toFsError({ code: 'not_allowed', message: 'the path did not come from a dialog' });
    expect(e.code).toBe('not_allowed');
    expect(describeFsError(e)).toContain('Open');
    expect(describeFsError(e)).not.toContain('dialog');
  });

  it('describes every code without Rust messages', () => {
    const text = describeFsError({ code: 'io', message: 'os error 5' });
    expect(text).not.toContain('os error');
  });
});
