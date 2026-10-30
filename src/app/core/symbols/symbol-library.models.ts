/**
 * Mirror of the symbol library DTOs in Rust `model.rs` (prompt 084). Keep both sides in sync by
 * hand. Symbols are named by id – the WebView never sees a path of the library folder.
 */

/** A symbol of the user's own library; `svg` is cleaned by Rust (design 084 E6). */
export interface LibrarySymbol {
  id: string;
  name: string;
  tags: string[];
  svg: string;
}

/** A symbol of a set (`lucide`, `tabler`, `phosphor`, `mine`). */
export interface SymbolRef {
  set: string;
  id: string;
}

/** `list_symbols`. */
export interface SymbolLibrary {
  symbols: LibrarySymbol[];
  /** Recently used symbols of every set, newest first. */
  recent: SymbolRef[];
}

/** `import_symbols`. */
export interface SymbolImport {
  imported: number;
  /** SVG files that were no usable symbol. */
  skipped: number;
  /** The library is full; the rest was not imported. */
  full: boolean;
}

/** `export_symbols`: the new folder (opaque path) and the count. */
export interface SymbolExport {
  folder: string;
  count: number;
}
