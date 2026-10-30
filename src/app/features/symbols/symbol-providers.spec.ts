import { SYMBOL_PROVIDERS } from './symbol-providers';

/** Node's `fs` without @types/node (the specs run in Node; as mockup-assets.spec). */
interface Fs {
  readFileSync(p: string, enc: 'utf8'): string;
}
const fs = (
  globalThis as unknown as { process: { getBuiltinModule(n: string): Fs } }
).process.getBuiltinModule('node:fs');

describe('the symbol sets (design 013 E16, 084 E1)', () => {
  it('unique ids, Lucide first, no SF Symbols', () => {
    const ids = SYMBOL_PROVIDERS.map((p) => p.id);
    expect(ids).toEqual(['lucide', 'tabler', 'phosphor']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.join(' ')).not.toMatch(/sf|apple/i);
  });

  it('every set has its licence text in THIRD-PARTY-NOTICES.txt (the version of package.json)', () => {
    const notices = fs.readFileSync('THIRD-PARTY-NOTICES.txt', 'utf8');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const p of SYMBOL_PROVIDERS) {
      const version = pkg.dependencies[p.license.package];
      expect(version, `${p.license.package} is a runtime dependency`).toMatch(/^\d+\.\d+\.\d+$/);
      const header = `${p.license.package} ${version} (${p.license.spdx}, npm)`;
      expect(notices.includes(header), `${header} – run pnpm notices`).toBe(true);
      expect(p.license.url).toMatch(/^https:\/\//);
    }
  });

  it('the generated data matches the installed package versions', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
    };
    for (const [file, name] of [
      ['tabler-outline.json', '@tabler/icons'],
      ['phosphor-regular.json', '@phosphor-icons/core'],
    ]) {
      const data = JSON.parse(fs.readFileSync(`src/app/features/symbols/data/${file}`, 'utf8')) as {
        version: string;
      };
      expect(data.version, file).toBe(pkg.dependencies[name]);
    }
  });
});
