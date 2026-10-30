/**
 * Mirror of the `.icon` DTOs in Rust `model.rs` (prompt 002, design 002). Keep both sides in
 * sync by hand; every change on both sides + a test.
 */

/** Any JSON value – `icon.json` is passed through as is (unknown fields included). */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Typed view of the known `icon.json` fields (design 002 E1); everything else stays as is. */
export interface IconJson {
  /** `"automatic"`, `"system-light"` … or an object – interpreted in prompt 010. */
  fill?: JsonValue;
  groups?: IconGroup[];
  'supported-platforms'?: SupportedPlatforms;
  [key: string]: unknown;
}

export interface IconGroup {
  layers?: IconLayer[];
  shadow?: { kind?: string; opacity?: number; [key: string]: unknown };
  translucency?: { enabled?: boolean; value?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export interface IconLayer {
  /** Missing when only `image-name-specializations` names the asset. */
  'image-name'?: string;
  name?: string;
  opacity?: number;
  [key: string]: unknown;
}

export interface SupportedPlatforms {
  /** Seen as `["watchOS"]`. */
  circles?: string | string[];
  /** Seen as `"shared"`. */
  squares?: string | string[];
  [key: string]: unknown;
}

/** Bundle folder (what Icon Composer writes) or the same zipped. */
export type IconFormat = 'bundle' | 'zip';

export type AssetKind = 'svg' | 'png' | 'other';

/** One asset of an opened document. */
export interface IconAssetDto {
  name: string;
  kind: AssetKind;
  /** SVG content (UTF-8, BOM removed). */
  text?: string;
  /** PNG content as `data:image/png;base64,…`. */
  dataUrl?: string;
}

export type IconWarningCode = 'missing_asset' | 'ignored_entry' | 'unreadable_asset';

/** Did not stop the file from opening; `name` is an asset or an entry path. */
export interface IconWarning {
  code: IconWarningCode;
  name: string;
}

export interface IconDocumentDto {
  /** `null` for a new, unsaved document. */
  path: string | null;
  /** File name for the title (from the backend, design 003 E13); `null` with `path`. */
  name: string | null;
  format: IconFormat;
  iconJson: IconJson;
  assets: IconAssetDto[];
  warnings: IconWarning[];
}

/**
 * One asset to save. The list is complete (left out = deleted). Unchanged assets carry only the
 * name – Rust takes their bytes from the version last opened/saved (design 002 E5).
 */
export interface SaveAsset {
  name: string;
  text?: string;
  /** A new or replaced PNG asset as `data:image/png;base64,…` (prompt 080 E6). */
  dataUrl?: string;
  unchanged: boolean;
  /** With `unchanged`: the asset's name in the session before it was renamed (design 010 E9). */
  source?: string;
}

export interface SaveIconRequest {
  path: string;
  format: IconFormat;
  iconJson: IconJson;
  assets: SaveAsset[];
  /** "Save As": the path the document was opened from (whose unchanged assets to take). */
  from?: string | null;
}

export interface SaveResult {
  path: string;
  /** File name for the title (design 003 E13). */
  name: string;
  format: IconFormat;
}

/** "Import SVG…" */
export interface SvgFile {
  name: string;
  text: string;
}

/** "Add › Image…" (design 008 E8) – Rust `ai-core::icon::image_file::ImageFile`. */
export interface ImageFileDto {
  name: string;
  /** `image/png`, `image/jpeg`, `image/webp` or `image/svg+xml`. */
  mime: string;
  /** `data:<mime>;base64,…` */
  dataUrl: string;
  /** Natural size from the header; `null` for SVG (read in the frontend). */
  width: number | null;
  height: number | null;
}
