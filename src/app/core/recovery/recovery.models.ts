/**
 * Mirror of the recovery DTOs in Rust `model.rs` (prompt 083). Keep both sides in sync by hand.
 * Snapshots are named by id – the WebView never sees a path of the recovery folder.
 */
import { IconDocumentDto, IconFormat, IconJson, SaveAsset } from '../icon-file/icon-file.models';

/** A snapshot of an unsaved document left by an app that is gone (crash, power cut). */
export interface RecoveryEntry {
  id: string;
  /** The document's file; `null` for one never saved. */
  path: string | null;
  /** File name; `null` = untitled. */
  name: string | null;
  /** The folder of `path` (from Rust – paths stay opaque). */
  location: string | null;
  /** When the snapshot was written (ms since 1970, UTC). */
  savedAt: number;
}

/** A restored snapshot: the document with its original path, and the snapshot's id now. */
export interface Recovered {
  id: string;
  document: IconDocumentDto;
}

/** `write_recovery`: the document like a save request; `id` = the snapshot to replace. */
export interface WriteRecoveryRequest {
  id: string | null;
  /** The document's file (kept in the snapshot); `null` for a new document. */
  path: string | null;
  /** Whose session holds the unchanged assets (the path the document was opened from). */
  from: string | null;
  format: IconFormat;
  iconJson: IconJson;
  assets: SaveAsset[];
}
