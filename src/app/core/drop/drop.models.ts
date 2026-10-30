/** What a dropped file is, by its extension (Rust `user_paths::drop_kind`, design 071 E2). */
export type DropKind = 'icon' | 'svg' | 'image' | 'other';

export interface DroppedFile {
  /** Opaque path from the backend (CLAUDE.md §4). */
  path: string;
  kind: DropKind;
}

/** Rust `drop_files::FileDropDto`: a drag of files over this window. */
export interface FileDropEvent {
  phase: 'enter' | 'over' | 'drop' | 'leave';
  /** On enter and drop; empty otherwise. */
  files: DroppedFile[];
  /** CSS pixels from the top left of the webview (= client coordinates). */
  x: number;
  y: number;
}
