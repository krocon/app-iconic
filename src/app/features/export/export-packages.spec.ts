import { APPICONSET_CONTENTS } from '../../../testing/fixtures/appiconset-contents';
import { DEFAULT_CHOICE, ExportChoice } from './export-options';
import {
  GREY_TINT,
  isPackage,
  PACKAGE_SOURCE,
  packageFiles,
  packageKind,
  packageSources,
} from './export-packages';

const choice = (extra: Partial<ExportChoice>): ExportChoice => ({ ...DEFAULT_CHOICE, ...extra });

describe('export packages (design 078)', () => {
  it('formats: packages vs loose files', () => {
    expect(['appiconset', 'icns', 'ico'].every((f) => isPackage(f as never))).toBe(true);
    expect(isPackage('png')).toBe(false);
    expect(packageKind(choice({ format: 'png' }))).toBeNull();
  });

  it('icon set kind: platforms and the iOS appearances besides light', () => {
    expect(
      packageKind(
        choice({ format: 'appiconset', appearances: ['light', 'tinted'], platforms: ['ios'] }),
      ),
    ).toEqual({
      kind: 'appIconSet',
      ios: true,
      appearances: ['tinted'],
      macos: false,
      watchos: false,
    });
    expect(packageKind(choice({ format: 'appiconset', platforms: [] }))).toBeNull();
    expect(packageKind(choice({ format: 'icns' }))).toEqual({ kind: 'icns' });
  });

  it('sources: iOS unmasked, tinted in grey, macOS framed, ico with the chosen mask', () => {
    const c = choice({ appearances: ['dark', 'tinted'], tint: '#ff0000', mask: 'circle' });
    const set = packageSources(
      {
        kind: 'appIconSet',
        ios: true,
        appearances: ['dark', 'tinted'],
        macos: true,
        watchos: true,
      },
      c,
    );
    expect(set.map((s) => [s.id, s.appearance, s.mask, s.frame])).toEqual([
      [PACKAGE_SOURCE.iosLight, 'light', 'none', null],
      [PACKAGE_SOURCE.iosDark, 'dark', 'none', null],
      [PACKAGE_SOURCE.iosTinted, 'tinted', 'none', null],
      [PACKAGE_SOURCE.macos, 'light', 'none', 'macos'],
      [PACKAGE_SOURCE.watchos, 'light', 'none', null],
    ]);
    expect(set.every((s) => s.tint === GREY_TINT)).toBe(true);
    expect(packageSources({ kind: 'ico' }, c)).toEqual([
      { id: 'windows', appearance: 'light', mask: 'circle', frame: null, tint: GREY_TINT },
    ]);
    expect(packageSources({ kind: 'icns' }, c)[0].frame).toBe('macos');
  });

  it('file names mirror the Rust plan (reference Contents.json)', () => {
    const all = packageFiles(
      {
        kind: 'appIconSet',
        ios: true,
        appearances: ['dark', 'tinted'],
        macos: true,
        watchos: true,
      },
      'x',
    );
    expect(all.folder).toBe('AppIcon.appiconset');
    expect(all.files).toEqual([
      'Contents.json',
      ...APPICONSET_CONTENTS.images.map((i: { filename: string }) => i.filename),
    ]);
    expect(packageFiles({ kind: 'icns' }, 'camscanner')).toEqual({
      folder: null,
      files: ['camscanner.icns'],
    });
    expect(packageFiles({ kind: 'ico' }, 'a').files).toEqual(['a.ico']);
  });
});
