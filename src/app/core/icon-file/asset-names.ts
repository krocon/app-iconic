import { IconAssetDto, IconJson } from './icon-file.models';

/**
 * The asset an `image-name` refers to (design 002 E11): exact name first, then NFC-normalised –
 * HFS+ stores file names as NFD, `icon.json` usually has NFC. Case matters (as in Rust).
 */
export function findAsset<T extends Pick<IconAssetDto, 'name'>>(
  assets: readonly T[],
  imageName: string,
): T | undefined {
  const exact = assets.find((a) => a.name === imageName);
  if (exact) return exact;
  const nfc = imageName.normalize('NFC');
  return assets.find((a) => a.name.normalize('NFC') === nfc);
}

/** Every `image-name` of every layer, in document order. */
export function imageNames(icon: IconJson): string[] {
  return (icon.groups ?? []).flatMap((g) =>
    (g.layers ?? []).flatMap((l) => (typeof l['image-name'] === 'string' ? [l['image-name']] : [])),
  );
}
