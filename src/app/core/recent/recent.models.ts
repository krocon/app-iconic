/** Mirror of `RecentFileDto` in Rust `model.rs` (prompt 003). */
export interface RecentFile {
  path: string;
  /** File name to show – the frontend never splits paths. */
  name: string;
}
