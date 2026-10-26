/**
 * Errors from the backend: `FsError { code, message, path }` (Rust `error.rs`). New codes go
 * into both files and into `describeFsError()`. The UI never shows Rust's `message`.
 */
export type FsErrorCode =
  | 'not_found'
  | 'permission_denied'
  | 'not_a_directory'
  | 'is_a_directory'
  | 'invalid_path'
  | 'io'
  /** No or broken `icon.json`, unsafe entry names (prompt 002). */
  | 'invalid_icon'
  /** E.g. an encrypted ZIP or unknown compression (prompt 002). */
  | 'unsupported_icon'
  /** Over the limits for files, entries or the whole archive (prompt 002). */
  | 'too_large'
  /** Saving: an asset marked unchanged is not known to the backend (prompt 002). */
  | 'missing_asset'
  /** An SVG file that is not UTF-8 text (prompt 002). */
  | 'invalid_svg'
  /** Frontend only: no Tauri backend (e.g. `pnpm start` in a browser). */
  | 'backend_unavailable'
  /** Frontend only: something that is no `FsError` was thrown. */
  | 'unknown';

export interface FsError {
  code: FsErrorCode;
  message: string;
  path?: string | null;
}

const KNOWN: readonly FsErrorCode[] = [
  'not_found',
  'permission_denied',
  'not_a_directory',
  'is_a_directory',
  'invalid_path',
  'io',
  'invalid_icon',
  'unsupported_icon',
  'too_large',
  'missing_asset',
  'invalid_svg',
  'backend_unavailable',
  'unknown',
];

export function isFsError(value: unknown): value is FsError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<FsError>;
  return typeof v.code === 'string' && typeof v.message === 'string';
}

/** Whatever was thrown → an `FsError` (unknown codes become `unknown`). */
export function toFsError(value: unknown): FsError {
  if (isFsError(value)) {
    return KNOWN.includes(value.code) ? value : { ...value, code: 'unknown' };
  }
  const message = value instanceof Error ? value.message : String(value);
  return { code: 'unknown', message };
}

/** User-facing text for an error (English; German follows in prompt 009). */
export function describeFsError(error: FsError): string {
  switch (error.code) {
    case 'not_found':
      return 'The file does not exist.';
    case 'permission_denied':
      return 'Access denied.';
    case 'not_a_directory':
      return 'This is not a folder.';
    case 'is_a_directory':
      return 'This is a folder, not a file.';
    case 'invalid_path':
      return 'The path is not valid.';
    case 'io':
      return 'The file could not be read or written.';
    case 'invalid_icon':
      return 'This is not a valid .icon file.';
    case 'unsupported_icon':
      return 'This .icon file uses a format that is not supported (e.g. an encrypted ZIP).';
    case 'too_large':
      return 'The file is too large.';
    case 'missing_asset':
      return 'An image of the document is missing.';
    case 'invalid_svg':
      return 'The SVG file could not be read as text.';
    case 'backend_unavailable':
      return 'The desktop backend is not available (running in a browser?).';
    case 'unknown':
      return 'Something went wrong.';
  }
}
