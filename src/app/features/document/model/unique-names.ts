/**
 * Unique asset and layer names – TypeScript twin of Rust `ai-core/src/icon/names.rs` (design
 * 002 E12, legacy §3 `makeUniqueAssetName`/`makeUniqueLayerName`, Marc Kronberg). Both are
 * checked against `testdata/unique-names.json`. Compared NFC-normalised and without case.
 */

const BAD = /[/\\:\p{Cc}]/gu;

export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

function sanitizeAssetBase(base: string): string {
  const replaced = base.trim().replace(BAD, '-');
  const trimmed = replaced.replace(/^\.+/, '').trim();
  return trimmed || 'layer.svg';
}

/** A file name for a new asset that no name in `existing` already has. */
export function uniqueAssetName(base: string, existing: readonly string[]): string {
  const name = sanitizeAssetBase(base);
  const taken = new Set(existing.map(nameKey));
  if (!taken.has(nameKey(name))) return name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] =
    dot > 0 && dot < name.length - 1 ? [name.slice(0, dot), name.slice(dot + 1)] : [name, 'svg'];
  for (let i = 2; ; i++) {
    const candidate = `${stem} ${i}.${ext}`;
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
