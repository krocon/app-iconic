import { checkArgs } from '../../core/actions/action-args';
import {
  choiceReady,
  DEFAULT_CHOICE,
  EXPORT_ARGS,
  exportFileName,
  exportRequest,
  exportVariants,
  fileBaseName,
  fileCount,
} from './export-options';

describe('export options', () => {
  it('arguments of the actions (AI rule)', () => {
    expect(checkArgs(EXPORT_ARGS, undefined)).toBe(true);
    expect(checkArgs(EXPORT_ARGS, { sizes: [512, 16], mask: 'circle', overwrite: true })).toBe(
      true,
    );
    expect(checkArgs(EXPORT_ARGS, { mask: 'star' })).toBe(false);
    expect(checkArgs(EXPORT_ARGS, { format: 'png' })).toBe(false);
  });

  it('exportRequest merges arguments into the base, sorted and checked', () => {
    const r = exportRequest(
      'png',
      { sizes: [16, 1024, 16], appearances: ['dark'] },
      DEFAULT_CHOICE,
    )!;
    expect(r).toEqual({
      ...DEFAULT_CHOICE,
      format: 'png',
      sizes: [1024, 16],
      appearances: ['dark'],
      overwrite: false,
    });
    const s = exportRequest(
      'svg',
      { mask: 'squircle', effects: true, targetDir: '/x', overwrite: true },
      DEFAULT_CHOICE,
    )!;
    expect(s).toMatchObject({ format: 'svg', mask: 'squircle', effects: true, targetDir: '/x' });
    expect(s.overwrite).toBe(true);
    for (const bad of [
      { sizes: [100] },
      { sizes: [] },
      { sizes: '1024' },
      { appearances: ['clear'] },
      { tint: 'orange' },
    ]) {
      expect(exportRequest('png', bad, DEFAULT_CHOICE)).toBeNull();
    }
  });

  it('file names, readiness and count', () => {
    expect(fileBaseName('camscanner.icon', 'Untitled')).toBe('camscanner');
    expect(fileBaseName('My.ICON', 'Untitled')).toBe('My');
    expect(fileBaseName(null, 'Untitled')).toBe('Untitled');
    expect(fileBaseName('.icon', 'Untitled')).toBe('Untitled');
    expect(choiceReady(DEFAULT_CHOICE)).toBe(true);
    expect(choiceReady({ ...DEFAULT_CHOICE, sizes: [] })).toBe(false);
    expect(choiceReady({ ...DEFAULT_CHOICE, format: 'svg', sizes: [] })).toBe(true);
    expect(choiceReady({ ...DEFAULT_CHOICE, appearances: [] })).toBe(false);
    expect(fileCount({ ...DEFAULT_CHOICE, sizes: [1024, 512, 16] })).toBe(6);
    expect(fileCount({ ...DEFAULT_CHOICE, format: 'svg' })).toBe(2);
  });

  it('tinted variants with their tint, file names as Rust writes them (prompt 077 E7)', () => {
    const r = exportRequest(
      'png',
      { appearances: ['tinted', 'light'], tint: '#FF8000' },
      DEFAULT_CHOICE,
    )!;
    expect(r.appearances).toEqual(['light', 'tinted']);
    expect(r.tint).toBe('#ff8000');
    expect(exportVariants(r)).toEqual([
      { appearance: 'light', tint: '#ff8000' },
      { appearance: 'tinted', tint: '#ff8000' },
    ]);
    expect(exportVariants({ ...DEFAULT_CHOICE, appearances: ['tinted'] })).toEqual([
      { appearance: 'tinted', tint: '#ffffff' },
    ]);
    expect(exportFileName('icon', 'tinted', 1024)).toBe('icon-tinted-1024.png');
    expect(exportFileName('icon', 'dark')).toBe('icon-dark.svg');
    expect(checkArgs(EXPORT_ARGS, { tint: '#ffffff', appearances: ['tinted'] })).toBe(true);
  });

  it('packages (prompt 078): platforms argument, readiness and file count', () => {
    const r = exportRequest(
      'appiconset',
      { platforms: ['watchos', 'ios', 'ios'], appearances: ['dark'] },
      DEFAULT_CHOICE,
    )!;
    expect(r.platforms).toEqual(['ios', 'watchos']);
    expect(exportRequest('appiconset', { platforms: ['android'] }, DEFAULT_CHOICE)).toBeNull();
    expect(exportRequest('appiconset', { platforms: [] }, DEFAULT_CHOICE)).toBeNull();
    expect(checkArgs(EXPORT_ARGS, { platforms: ['ios'] })).toBe(true);
    const set = { ...DEFAULT_CHOICE, format: 'appiconset' as const };
    expect(choiceReady({ ...set, platforms: [] })).toBe(false);
    // the icon set does not need loose appearances or sizes
    expect(choiceReady({ ...set, appearances: [], sizes: [] })).toBe(true);
    // Contents.json + iOS default + dark + 10 macOS images
    expect(fileCount(set)).toBe(13);
    expect(fileCount({ ...set, appearances: ['light'], platforms: ['ios'] })).toBe(2);
    expect(fileCount({ ...DEFAULT_CHOICE, format: 'ico' })).toBe(1);
    expect(choiceReady({ ...DEFAULT_CHOICE, format: 'icns', appearances: [] })).toBe(true);
  });
});
