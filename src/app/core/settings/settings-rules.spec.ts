import { describe, expect, it } from 'vitest';
import { SETTINGS_CASES } from '../../../testing/fixtures/settings-cases';
import {
  applyPatch,
  checkedValue,
  joinPatches,
  patchFor,
  SETTING_KEYS,
  settingsFromJson,
  valueAt,
} from './settings-rules';
import { DEFAULT_SETTINGS } from './settings.models';

describe('settings rules (design 015 E2, same table as Rust)', () => {
  it('the defaults are the shared table', () => {
    expect(DEFAULT_SETTINGS).toEqual(SETTINGS_CASES.defaults);
    expect(settingsFromJson({})).toEqual(DEFAULT_SETTINGS);
  });

  for (const c of SETTINGS_CASES.cases) {
    it(c.name, () => {
      const s = settingsFromJson(c.input);
      for (const [path, value] of c.expect) expect(valueAt(s, path), path).toEqual(value);
    });
  }

  it('anything that is no object is the defaults', () => {
    for (const v of [null, 3, 'x', [1]]) expect(settingsFromJson(v)).toEqual(DEFAULT_SETTINGS);
  });

  it('patches change only what they name; a set folder can be cleared', () => {
    const cur = applyPatch(DEFAULT_SETTINGS, {
      canvas: { rulers: false },
      export: { targetDir: '/a' },
    });
    const s = applyPatch(cur, { panels: { commands: { width: 1000 } }, theme: 'dark' });
    expect(s.panels.commands.width).toBe(480);
    expect(s.canvas.rulers).toBe(false);
    expect(s.theme).toBe('dark');
    expect(applyPatch(s, { export: { targetDir: null } }).export.targetDir).toBeNull();
    expect(applyPatch(s, { theme: 1 as never }).theme).toBe('dark');
  });

  it('keys, patches and checked values', () => {
    expect(SETTING_KEYS).toContain('canvas.rulers');
    expect(SETTING_KEYS).toContain('panels.hierarchy.width');
    expect(SETTING_KEYS).toContain('export.sizes');
    expect(SETTING_KEYS).not.toContain('schemaVersion');
    expect(SETTING_KEYS).not.toContain('canvas');
    expect(patchFor('canvas.rulers', false)).toEqual({ canvas: { rulers: false } });
    expect(patchFor('canvas.laser', true)).toBeNull();
    const d = DEFAULT_SETTINGS;
    expect(checkedValue(d, 'panels.commands.width', 1000)).toBe(480);
    expect(checkedValue(d, 'panels.commands.width', 200.5)).toBeNull();
    expect(checkedValue(d, 'theme', 'sepia')).toBe('system');
    expect(checkedValue(d, 'theme', 3)).toBeNull();
    expect(checkedValue(d, 'canvas.zoom', 1.5)).toBe(1.5);
    expect(checkedValue(d, 'export.sizes', [16, 1024])).toEqual([1024, 16]);
    expect(checkedValue(d, 'export.targetDir', null)).toBeNull();
    expect(checkedValue(d, 'export.targetDir', '/x')).toBe('/x');
    expect(checkedValue(d, 'canvas', {})).toBeNull();
  });

  it('joins patches (later wins, lists replace)', () => {
    expect(
      joinPatches(
        { canvas: { rulers: false }, export: { sizes: [16] } },
        { canvas: { guides: false }, export: { sizes: [32] } },
      ),
    ).toEqual({ canvas: { rulers: false, guides: false }, export: { sizes: [32] } });
  });
});
