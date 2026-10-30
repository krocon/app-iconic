/** Mirror of `RecentFileDto` in Rust `model.rs` (prompt 003). */
export interface RecentFile {
  path: string;
  /** File name to show – the frontend never splits paths. */
  name: string;
}

/** Mirror of `RecentEntryDto` in Rust `model.rs` (prompt 082): an entry of the start screen. */
export interface RecentEntry {
  path: string;
  name: string;
  /** The folder the file lies in, from the backend (paths are never split here). */
  location: string;
  /** Preview image as `data:` URL; `null` = none yet. */
  thumbnail: string | null;
}
