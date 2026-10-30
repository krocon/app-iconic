import { translatable } from '../i18n/i18n';

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
  /** A menu spec the backend refused (prompt 005). */
  | 'invalid_menu'
  /** No PNG, JPEG, WebP or SVG image (prompt 008). */
  | 'invalid_image'
  /** An export target exists and overwriting was not confirmed (prompt 012). */
  | 'already_exists'
  /** Text to path: empty text, a line break, size or spacing out of range (prompt 013). */
  | 'invalid_text'
  /** Text to path: the font has no glyph for some characters, e.g. emoji (prompt 013). */
  | 'missing_glyphs'
  /** AI control (prompt 018): the document changed since the revision the AI expected. */
  | 'revision_conflict'
  /** AI control: no open document (window) with this id. */
  | 'unknown_document'
  /** AI control: missing, wrong or too large arguments of a tool. */
  | 'invalid_request'
  /** AI control: the window did not answer in time. */
  | 'timeout'
  /** AI control: the user did not allow it (save to a new path, export). */
  | 'denied'
  /** AI control: the action is not allowed for the AI, not enabled, or its arguments do not fit. */
  | 'unavailable'
  /**
   * A path from no trusted source (dialog, Open Recent, the system, a drop, the AI bridge, an
   * internal folder) – prompt 033 E1.
   */
  | 'not_allowed'
  /** A recovery snapshot that is gone, taken elsewhere or still in use by a running app (083). */
  | 'recovery_unavailable'
  /** Shortcut changes the backend refused: bad action ids, chords or too many (prompt 085). */
  | 'invalid_keymap'
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
  'invalid_menu',
  'invalid_image',
  'already_exists',
  'invalid_text',
  'missing_glyphs',
  'revision_conflict',
  'unknown_document',
  'invalid_request',
  'timeout',
  'denied',
  'unavailable',
  'not_allowed',
  'recovery_unavailable',
  'invalid_keymap',
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

const EN = {
  not_found: 'The file does not exist.',
  permission_denied: 'Access denied.',
  not_a_directory: 'This is not a folder.',
  is_a_directory: 'This is a folder, not a file.',
  invalid_path: 'The path is not valid.',
  io: 'The file could not be read or written.',
  invalid_icon: 'This is not a valid .icon file.',
  unsupported_icon: 'This .icon file uses a format that is not supported (e.g. an encrypted ZIP).',
  too_large: 'The file is too large.',
  missing_asset: 'An image of the document is missing.',
  invalid_svg: 'The SVG file could not be read as text.',
  invalid_menu: 'The menu could not be built.',
  invalid_image: 'The file is not a PNG, JPEG, WebP or SVG image.',
  already_exists: 'A file with this name already exists.',
  invalid_text: 'Enter one line of text (size and spacing within their ranges).',
  missing_glyphs: 'The font has no shapes for some characters (e.g. emoji). Choose another font.',
  revision_conflict: 'The document changed in the meantime.',
  unknown_document: 'This document is not open.',
  invalid_request: 'The request was not valid.',
  timeout: 'The window did not answer in time.',
  denied: 'Not allowed.',
  unavailable: 'This function is not available now.',
  not_allowed:
    'The app may not use this file. Choose it with Open or Import, or drop it on the window.',
  recovery_unavailable:
    'This recovered document is no longer available. Another window may have restored it.',
  invalid_keymap: 'The shortcuts could not be saved.',
  backend_unavailable: 'The desktop backend is not available (running in a browser?).',
  unknown: 'Something went wrong.',
} as const satisfies Record<FsErrorCode, string>;

const TEXTS = translatable('errors', EN, {
  de: {
    not_found: 'Die Datei gibt es nicht.',
    permission_denied: 'Zugriff verweigert.',
    not_a_directory: 'Das ist kein Ordner.',
    is_a_directory: 'Das ist ein Ordner, keine Datei.',
    invalid_path: 'Der Pfad ist ungültig.',
    io: 'Die Datei konnte nicht gelesen oder geschrieben werden.',
    invalid_icon: 'Das ist keine gültige .icon-Datei.',
    unsupported_icon:
      'Diese .icon-Datei hat ein Format, das nicht unterstützt wird (z. B. ein verschlüsseltes ZIP).',
    too_large: 'Die Datei ist zu groß.',
    missing_asset: 'Ein Bild des Dokuments fehlt.',
    invalid_svg: 'Die SVG-Datei konnte nicht als Text gelesen werden.',
    invalid_menu: 'Das Menü konnte nicht gebaut werden.',
    invalid_image: 'Die Datei ist kein PNG-, JPEG-, WebP- oder SVG-Bild.',
    already_exists: 'Eine Datei mit diesem Namen gibt es schon.',
    invalid_text: 'Gib eine Zeile Text ein (Größe und Abstand in ihren Bereichen).',
    missing_glyphs:
      'Die Schrift hat für einige Zeichen keine Formen (z. B. Emoji). Wähle eine andere Schrift.',
    revision_conflict: 'Das Dokument hat sich inzwischen geändert.',
    unknown_document: 'Dieses Dokument ist nicht geöffnet.',
    invalid_request: 'Die Anfrage war ungültig.',
    timeout: 'Das Fenster hat nicht rechtzeitig geantwortet.',
    denied: 'Nicht erlaubt.',
    unavailable: 'Diese Funktion ist gerade nicht verfügbar.',
    not_allowed:
      'Die App darf diese Datei nicht verwenden. Wähle sie mit Öffnen oder Importieren oder lege sie auf dem Fenster ab.',
    recovery_unavailable:
      'Dieses wiederhergestellte Dokument ist nicht mehr verfügbar. Vielleicht hat ein anderes Fenster es schon wiederhergestellt.',
    invalid_keymap: 'Die Tastenkürzel konnten nicht gesichert werden.',
    backend_unavailable: 'Das Desktop-Backend ist nicht verfügbar (läuft es im Browser?).',
    unknown: 'Etwas ist schiefgegangen.',
  },
});

/** User-facing text for an error, in the UI language (design 015 E13). */
export function describeFsError(error: FsError): string {
  return TEXTS[error.code] ?? TEXTS.unknown;
}
