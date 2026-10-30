import { SCENES, sceneLayout } from './mockup-scenes';
import { sceneSvg } from './mockup-svg';

/** Node's `fs` without @types/node (the specs run in Node; prompt 081). */
interface Fs {
  readdirSync(p: string, o?: { recursive?: boolean }): string[];
  readFileSync(p: string, enc: 'utf8'): string;
}
const fs = (
  globalThis as unknown as { process: { getBuiltinModule(n: string): Fs } }
).process.getBuiltinModule('node:fs');

const IMAGE = /\.(png|jpe?g|webp|gif|svg|ico|icns|heic|tiff?|bmp|avif)$/i;

describe('no foreign assets (prompt 081)', () => {
  it('the bundle ships only the own app icon as image', () => {
    expect(fs.readdirSync('public').sort()).toEqual(['favicon.png', 'icon.svg']);
    // no image file anywhere in the app sources (fixtures are generated TS modules)
    const images = fs.readdirSync('src', { recursive: true }).filter((p) => IMAGE.test(p));
    expect(images).toEqual([]);
  });

  it('the mockup code loads nothing: no URLs, no image imports', () => {
    const dir = 'src/app/features/mockups';
    for (const f of fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
      const src = fs.readFileSync(`${dir}/${f}`, 'utf8').replace('http://www.w3.org/2000/svg', '');
      expect({
        f,
        url: /https?:\/\/|file:|import\s.*\.(png|jpe?g|webp|svg)['"]/.test(src),
      }).toEqual({
        f,
        url: false,
      });
    }
  });

  it('scenes without an icon or background are pure own vector graphics', () => {
    for (const s of SCENES) {
      const svg = sceneSvg({
        layout: sceneLayout(s.id),
        appearance: 'light',
        icon: null,
        name: 'x',
        background: null,
        title: 'x',
      });
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('data:');
    }
  });
});
