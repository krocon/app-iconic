/**
 * Unique asset and layer names – TypeScript twin of Rust `ai-core/src/icon/names.rs` (design
 * 002 E12, legacy §3 `makeUniqueAssetName`/`makeUniqueLayerName`, Marc Kronberg). Both are
 * checked against `testdata/unique-names.json`. Compared NFC-normalised and without case.
 */

/** Longest new asset name in UTF-8 bytes (Rust `MAX_NAME_BYTES`). */
export const MAX_NAME_BYTES = 200;

/** Path separators and what Windows refuses (prompt 031). */
const BAD = /[/\\:<>"|?*\p{Cc}]/gu;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** `stem` cut (at a code point) so that `stem + tail` fits {@link MAX_NAME_BYTES}. */
function fit(stem: string, tail: string): string {
  const room = MAX_NAME_BYTES - bytes(tail);
  let out = '';
  let used = 0;
  for (const c of stem) {
    const n = bytes(c);
    if (used + n > room) break;
    out += c;
    used += n;
  }
  return out.trimEnd() + tail;
}

/** `[stem, ext]`; no extension: `ext` is empty. */
function splitExt(name: string): [string, string] {
  const dot = name.lastIndexOf('.');
  const ext = name.slice(dot + 1);
  return dot > 0 && ext.length > 0 && bytes(ext) <= 16 ? [name.slice(0, dot), ext] : [name, ''];
}

function sanitizeAssetBase(base: string): string {
  const replaced = base.trim().replace(BAD, '-');
  // Windows drops trailing dots and spaces – two names would become one
  const trimmed = replaced
    .replace(/^\.+/, '')
    .trim()
    .replace(/[. ]+$/, '');
  if (!trimmed) return 'layer.svg';
  const name = RESERVED.test(trimmed.split('.')[0].trimEnd()) ? `_${trimmed}` : trimmed;
  if (bytes(name) <= MAX_NAME_BYTES) return name;
  const [stem, ext] = splitExt(name);
  return fit(stem, ext ? `.${ext}` : '');
}

/** A file name for a new asset that no name in `existing` already has. */
export function uniqueAssetName(base: string, existing: readonly string[]): string {
  const name = sanitizeAssetBase(base);
  const taken = new Set(existing.map(nameKey));
  if (!taken.has(nameKey(name))) return name;
  const [stem, e] = splitExt(name);
  const ext = e || 'svg';
  for (let i = 2; ; i++) {
    const candidate = fit(stem, ` ${i}.${ext}`);
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

/** A name for a new layer that no name in `existing` already has. */
export function uniqueLayerName(base: string, existing: readonly string[]): string {
  const name = base.trim() || 'layer';
  const taken = new Set(existing.map(nameKey));
  if (!taken.has(nameKey(name))) return name;
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}

/** The layer name for an imported file: the asset name without its extension. */
export function layerNameFor(assetName: string): string {
  const dot = assetName.lastIndexOf('.');
  return dot > 0 ? assetName.slice(0, dot) : assetName;
}
