import { checkArgs } from '../../core/actions/action-args';
import {
  choiceReady,
  DEFAULT_CHOICE,
  EXPORT_ARGS,
  exportRequest,
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
      { appearances: ['tinted'] },
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
});
