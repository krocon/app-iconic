import { FsError } from '../app/core/errors/fs-error';
import { SymbolLibraryApi } from '../app/core/symbols/symbol-library-api';
import {
  LibrarySymbol,
  SymbolExport,
  SymbolImport,
  SymbolLibrary,
  SymbolRef,
} from '../app/core/symbols/symbol-library.models';
import { sanitizeSvg } from '../app/features/document/svg/sanitize-svg';

function error(code: FsError['code'], message: string): FsError {
  return { code, message, path: null };
}

/** Rules of Rust `ai_core::symbols` (prompt 084) in small: limits, ids, names, tags. */
export const FAKE_MAX_SYMBOLS = 500;
const MAX_RECENT = 24;
const SHAPES = 'path, circle, ellipse, rect, line, polyline, polygon';

function cleanName(s: string): string | null {
  const t = s
    .replace(/[\s\p{Cc}]+/gu, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return t || null;
}

function cleanTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    const c = cleanName(t.replace(/,/g, ' ').toLowerCase())?.slice(0, 32).trim();
    if (c && !out.includes(c)) out.push(c);
  }
  return out.slice(0, 16);
}

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44)
    .replace(/-+$/, '');
  return s || 'symbol';
}

/**
 * Test double of {@link SymbolLibraryApi} (prompt 084): an in-memory library with the rules of
 * Rust (cleaned markup, `title` = name, `data-tags`, ids from the name, at most 500 symbols, 24
 * recent). Folders for import/export are maps of `{ name, svg }`.
 */
export class FakeSymbolLibraryApi extends SymbolLibraryApi {
  readonly symbols = new Map<string, LibrarySymbol>();
  recent: SymbolRef[] = [];
  /** The answer of `pickFolder`. */
  picked: string | null = '/browser/symbols';
  readonly folders = new Map<string, { name: string; svg: string }[]>();
  readonly exported = new Map<string, LibrarySymbol[]>();
  /** The next call fails with this error. */
  failNext: FsError | null = null;

  private fail(): void {
    const e = this.failNext;
    this.failNext = null;
    if (e) throw e;
  }

  /** Cleans like Rust (here with the frontend's sanitizer) and writes name and tags. */
  canonical(svg: string, name: string, tags: string[]): string {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = doc.documentElement;
    if (root?.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) {
      throw error('invalid_svg', 'not an SVG');
    }
    sanitizeSvg(root);
    root
      .querySelectorAll('script, style, text, image, use, foreignObject')
      .forEach((e) => e.remove());
    if (!root.getAttribute('viewBox')) throw error('invalid_svg', 'no viewBox');
    if (!root.querySelector(SHAPES)) throw error('invalid_svg', 'nothing to draw');
    root.querySelectorAll('title').forEach((t) => t.remove());
    const title = doc.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = name;
    root.prepend(title);
    if (tags.length) root.setAttribute('data-tags', tags.join(', '));
    else root.removeAttribute('data-tags');
    return new XMLSerializer().serializeToString(root);
  }

  private newId(name: string): string {
    const base = slug(name);
    if (!this.symbols.has(base)) return base;
    for (let n = 2; ; n++) if (!this.symbols.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  private sorted(): LibrarySymbol[] {
    return [...this.symbols.values()].sort(
      (a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id),
    );
  }

  async list(): Promise<SymbolLibrary> {
    this.fail();
    return { symbols: this.sorted().map((s) => ({ ...s })), recent: [...this.recent] };
  }

  async save(name: string, tags: string[], svg: string): Promise<LibrarySymbol> {
    this.fail();
    const n = cleanName(name);
    if (!n) throw error('invalid_request', 'a symbol needs a name');
    const t = cleanTags(tags);
    const markup = this.canonical(svg, n, t);
    if (this.symbols.size >= FAKE_MAX_SYMBOLS) throw error('too_large', 'library full');
    const s = { id: this.newId(n), name: n, tags: t, svg: markup };
    this.symbols.set(s.id, s);
    return { ...s };
  }

  async update(id: string, name: string, tags: string[]): Promise<LibrarySymbol> {
    this.fail();
    const old = this.symbols.get(id);
    if (!old) throw error('not_found', 'no such symbol');
    const n = cleanName(name);
    if (!n) throw error('invalid_request', 'a symbol needs a name');
    const t = cleanTags(tags);
    const s = { id, name: n, tags: t, svg: this.canonical(old.svg, n, t) };
    this.symbols.set(id, s);
    return { ...s };
  }

  async remove(id: string): Promise<boolean> {
    this.fail();
    this.recent = this.recent.filter((r) => !(r.set === 'mine' && r.id === id));
    return this.symbols.delete(id);
  }

  async recordUse(ref: SymbolRef): Promise<SymbolRef[]> {
    this.fail();
    if (!/^[a-z0-9-]{1,32}$/.test(ref.set) || !/^[A-Za-z0-9_.-]{1,128}$/.test(ref.id)) {
      throw error('invalid_request', 'not a symbol of a set');
    }
    this.recent = [
      { set: ref.set, id: ref.id },
      ...this.recent.filter((r) => !(r.set === ref.set && r.id === ref.id)),
    ].slice(0, MAX_RECENT);
    return [...this.recent];
  }

  async pickFolder(): Promise<string | null> {
    return this.picked;
  }

  async importFolder(path: string): Promise<SymbolImport> {
    this.fail();
    const files = this.folders.get(path);
    if (!files) throw error('not_found', 'no such folder');
    const r: SymbolImport = { imported: 0, skipped: 0, full: false };
    for (const f of files) {
      if (this.symbols.size >= FAKE_MAX_SYMBOLS) {
        r.full = true;
        break;
      }
      try {
        const title = /<title>([^<]*)<\/title>/.exec(f.svg)?.[1];
        await this.save(title ?? f.name, [], f.svg);
        r.imported++;
      } catch {
        r.skipped++;
      }
    }
    return r;
  }

  async exportFolder(path: string): Promise<SymbolExport> {
    this.fail();
    let folder = `${path}/AppIconic Symbols`;
    for (let n = 2; this.exported.has(folder); n++) folder = `${path}/AppIconic Symbols ${n}`;
    this.exported.set(folder, this.sorted());
    return { folder, count: this.symbols.size };
  }
}
