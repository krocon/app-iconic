import { EXPORT_TEXT_FIXTURES } from '../../../testing/fixtures/export-texts';
import { camscannerDocument } from '../../../testing/documents';
import { DEFAULT_CHOICE, ExportChoice, exportRequest, fileCount } from './export-options';
import {
  ANDROID_CANVAS_SCALE,
  ANDROID_DENSITIES,
  androidFiles,
  androidLayers,
  parseGroupIndexes,
  WEB_FILES,
  WEB_MANIFEST,
  WEB_MASKABLE_SCALE,
  WEB_SNIPPET,
} from './export-android-web';
import {
  GREY_TINT,
  isPackage,
  PACKAGE_SOURCE,
  packageFiles,
  packageKind,
  packageSources,
} from './export-packages';
import { exportSvg } from './export-svg';
import { colorSchemeSvg, SCHEME_CLASS } from './favicon-svg';

const choice = (extra: Partial<ExportChoice>): ExportChoice => ({ ...DEFAULT_CHOICE, ...extra });
const parse = (text: string) =>
  new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;

describe('Android and web packages (prompt 079)', () => {
  it('platform numbers: 108 dp layers, canvas = 72 dp viewport, maskable safe zone 40 %', () => {
    expect(ANDROID_CANVAS_SCALE).toBeCloseTo(72 / 108);
    expect(WEB_MASKABLE_SCALE).toBe(0.8);
    expect(ANDROID_DENSITIES.map(([, s]) => 108 * s)).toEqual([108, 162, 216, 324, 432]);
    expect(ANDROID_DENSITIES.map(([, s]) => 48 * s)).toEqual([48, 72, 96, 144, 192]);
  });

  it('layers: background = the chosen groups, foreground = the rest (default: all in front)', () => {
    expect(androidLayers(3, [])).toEqual({ foreground: [0, 1, 2], background: [] });
    expect(androidLayers(3, [2, 0])).toEqual({ foreground: [1], background: [0, 2] });
    // unknown indexes are ignored, no groups → nothing
    expect(androidLayers(2, [5, 1])).toEqual({ foreground: [0], background: [1] });
    expect(androidLayers(0, [0])).toEqual({ foreground: [], background: [] });
  });

  it('group indexes of the AI: integers ≥ 0, sorted, without duplicates', () => {
    expect(parseGroupIndexes([2, 0, 2])).toEqual([0, 2]);
    expect(parseGroupIndexes([])).toEqual([]);
    for (const bad of [[-1], [1.5], ['1'], 1, null]) expect(parseGroupIndexes(bad)).toBeNull();
  });

  it('options: monochrome and backgroundGroups as arguments, file counts', () => {
    const r = exportRequest(
      'android',
      { monochrome: false, backgroundGroups: [1] },
      DEFAULT_CHOICE,
    );
    expect(r).toMatchObject({ format: 'android', monochrome: false, backgroundGroups: [1] });
    expect(exportRequest('android', { backgroundGroups: [-2] }, DEFAULT_CHOICE)).toBeNull();
    expect(DEFAULT_CHOICE).toMatchObject({ monochrome: true, backgroundGroups: [] });
    expect(fileCount(choice({ format: 'android' }))).toBe(28);
    expect(fileCount(choice({ format: 'android', monochrome: false }))).toBe(23);
    expect(fileCount(choice({ format: 'web' }))).toBe(8);
  });

  it('kinds and file names (mirror of the Rust plans)', () => {
    expect(isPackage('android') && isPackage('web')).toBe(true);
    expect(packageKind(choice({ format: 'android', monochrome: false }))).toEqual({
      kind: 'android',
      monochrome: false,
    });
    expect(packageKind(choice({ format: 'web' }))).toEqual({ kind: 'web' });
    const a = packageFiles({ kind: 'android', monochrome: true }, 'x');
    expect(a.folder).toBe('android');
    expect(a.files.slice(0, 2)).toEqual([
      'res/mipmap-anydpi-v26/ic_launcher.xml',
      'res/mipmap-anydpi-v26/ic_launcher_round.xml',
    ]);
    expect(a.files).toContain('res/mipmap-xxxhdpi/ic_launcher_monochrome.png');
    expect(a.files.at(-1)).toBe('ic_launcher-playstore.png');
    expect(androidFiles(false).some((f) => f.includes('monochrome'))).toBe(false);
    expect(packageFiles({ kind: 'web' }, 'x')).toEqual({ folder: 'web', files: [...WEB_FILES] });
  });

  it('texts to copy = the reference files Rust writes', () => {
    expect(WEB_MANIFEST).toBe(EXPORT_TEXT_FIXTURES['manifest.webmanifest']);
    expect(WEB_SNIPPET).toBe(EXPORT_TEXT_FIXTURES['snippet.html']);
    const icons = JSON.parse(WEB_MANIFEST).icons as { src: string; purpose?: string }[];
    for (const i of icons) expect(WEB_FILES).toContain(i.src.slice(1));
    expect(icons.find((i) => i.purpose === 'maskable')?.src).toBe('/icon-maskable-512.png');
    expect(EXPORT_TEXT_FIXTURES['ic_launcher.xml']).toContain('<monochrome');
  });

  it('Android sources: foreground without fill, background with fill, monochrome in grey', () => {
    const c = choice({ format: 'android', backgroundGroups: [1] });
    const s = packageSources({ kind: 'android', monochrome: true }, c, 2);
    const by = (id: string) => s.find((x) => x.id === id)!;
    expect(s.map((x) => x.id).sort()).toEqual(
      [
        PACKAGE_SOURCE.androidForeground,
        PACKAGE_SOURCE.androidBackground,
        PACKAGE_SOURCE.androidLegacy,
        PACKAGE_SOURCE.androidRound,
        PACKAGE_SOURCE.androidPlay,
        PACKAGE_SOURCE.androidMonochrome,
      ].sort(),
    );
    expect(by('android-foreground')).toMatchObject({ groups: [0], fill: false, scale: 2 / 3 });
    expect(by('android-background')).toMatchObject({ groups: [1], fill: true, scale: 2 / 3 });
    expect(by('android-monochrome')).toMatchObject({
      appearance: 'tinted',
      tint: GREY_TINT,
      groups: [0],
      fill: false,
    });
    expect(by('android-legacy').mask).toBe('squircle');
    expect(by('android-round').mask).toBe('circle');
    expect(by('android-play')).toMatchObject({ mask: 'none', scale: 1, groups: null });
    expect(packageSources({ kind: 'android', monochrome: false }, c, 2)).toHaveLength(5);
  });

  it('web sources: the chosen mask for favicons, touch icon unmasked, maskable at 80 %', () => {
    const s = packageSources({ kind: 'web' }, choice({ format: 'web', mask: 'circle' }));
    expect(s.map((x) => [x.id, x.mask, x.scale, x.colorScheme])).toEqual([
      ['web-any', 'circle', 1, false],
      ['web-favicon', 'circle', 1, true],
      ['web-touch', 'none', 1, false],
      ['web-maskable', 'none', 0.8, false],
    ]);
  });
});

describe('exportSvg options of prompt 079', () => {
  it('scale: canvas into the middle, the fill bleeds to the edges', () => {
    const d = camscannerDocument();
    const root = parse(exportSvg(d, 'light', { mask: 'none', effects: false, scale: 0.8 }));
    const g = root.querySelector('.ai-export-scaled')!;
    expect(g.getAttribute('transform')).toBe('translate(102.4 102.4) scale(0.8)');
    const bg = g.querySelector('.ai-export-background')!;
    expect([bg.getAttribute('x'), bg.getAttribute('width')]).toEqual(['-128', '1280']);
    expect(root.getAttribute('viewBox')).toBe('0 0 1024 1024');
  });

  it('groups and fill: only the chosen groups, optionally without the fill', () => {
    const d = camscannerDocument();
    const all = parse(exportSvg(d, 'light', { mask: 'none', effects: false }));
    expect(all.querySelectorAll('.ai-export-group')).toHaveLength(2);
    const one = parse(
      exportSvg(d, 'light', { mask: 'none', effects: false, groups: [1], fill: false }),
    );
    expect(one.querySelectorAll('.ai-export-group')).toHaveLength(1);
    expect(one.querySelector('.ai-export-background')).toBeNull();
    const none = parse(exportSvg(d, 'light', { mask: 'none', effects: false, groups: [] }));
    expect(none.querySelectorAll('.ai-export-group')).toHaveLength(0);
    expect(none.querySelector('.ai-export-background')).not.toBeNull();
  });

  it('a gradient fill keeps its geometry on the canvas when it bleeds', () => {
    const d = camscannerDocument();
    d.iconJson['fill'] = { 'linear-gradient': ['srgb:1,0,0,1', 'srgb:0,0,1,1'] } as never;
    const root = parse(
      exportSvg(d, 'light', { mask: 'none', effects: false, scale: 2 / 3, fill: true }),
    );
    expect(root.querySelector('#ai-export-fill')!.getAttribute('gradientTransform')).toBe(
      'translate(0.1667 0.1667) scale(0.6667)',
    );
  });
});

describe('favicon.svg (prompt 079 E6)', () => {
  it('light and dark in one SVG, switched by prefers-color-scheme, ids kept apart', () => {
    const d = camscannerDocument();
    const light = exportSvg(d, 'light', { mask: 'squircle', effects: false });
    const dark = exportSvg(d, 'dark', { mask: 'squircle', effects: false });
    const text = colorSchemeSvg(light, dark);
    const root = parse(text);
    expect(root.querySelector('style')!.textContent).toContain('prefers-color-scheme: dark');
    expect(root.querySelector(`.${SCHEME_CLASS.light} #light-ai-export-mask`)).not.toBeNull();
    expect(root.querySelector(`.${SCHEME_CLASS.dark} #dark-ai-export-mask`)).not.toBeNull();
    const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(text).toContain('url(#dark-ai-export-mask)');
    // the same picture twice → one
    expect(colorSchemeSvg(light, light)).toBe(light);
  });
});
