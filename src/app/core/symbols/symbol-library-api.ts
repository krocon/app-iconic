import { Injectable } from '@angular/core';
import { call } from '../backend/call';
import {
  LibrarySymbol,
  SymbolExport,
  SymbolImport,
  SymbolLibrary,
  SymbolRef,
} from './symbol-library.models';

/** Typed facade of the symbol library commands (prompt 084). Tests use `FakeSymbolLibraryApi`. */
export abstract class SymbolLibraryApi {
  /** The library (cleaned) and the recently used symbols. */
  abstract list(): Promise<SymbolLibrary>;
  /** Saves `svg` as a new symbol (cleaned by the backend). */
  abstract save(name: string, tags: string[], svg: string): Promise<LibrarySymbol>;
  /** Renames a symbol and sets its tags. */
  abstract update(id: string, name: string, tags: string[]): Promise<LibrarySymbol>;
  /** Removes a symbol; `false` if there was none. */
  abstract remove(id: string): Promise<boolean>;
  /** Puts a symbol in front of the recently used ones; the new list. */
  abstract recordUse(ref: SymbolRef): Promise<SymbolRef[]>;
  /** Native folder dialog (the export one); `null` = cancelled. The path is granted. */
  abstract pickFolder(): Promise<string | null>;
  /** Imports the SVG files of a picked folder. */
  abstract importFolder(path: string): Promise<SymbolImport>;
  /** Writes the library into a new folder inside a picked one. */
  abstract exportFolder(path: string): Promise<SymbolExport>;
}

@Injectable()
export class TauriSymbolLibraryApi extends SymbolLibraryApi {
  /** The bridge (`call.ts`); a test replaces it to check the argument names. */
  protected backend: typeof call = call;

  list(): Promise<SymbolLibrary> {
    return this.backend<SymbolLibrary>('list_symbols');
  }

  save(name: string, tags: string[], svg: string): Promise<LibrarySymbol> {
    return this.backend<LibrarySymbol>('save_symbol', { name, tags, svg });
  }

  update(id: string, name: string, tags: string[]): Promise<LibrarySymbol> {
    return this.backend<LibrarySymbol>('update_symbol', { id, name, tags });
  }

  remove(id: string): Promise<boolean> {
    return this.backend<boolean>('delete_symbol', { id });
  }

  recordUse(ref: SymbolRef): Promise<SymbolRef[]> {
    return this.backend<SymbolRef[]>('record_symbol_use', { set: ref.set, id: ref.id });
  }

  pickFolder(): Promise<string | null> {
    return this.backend<string | null>('pick_export_dir');
  }

  importFolder(path: string): Promise<SymbolImport> {
    return this.backend<SymbolImport>('import_symbols', { path });
  }

  exportFolder(path: string): Promise<SymbolExport> {
    return this.backend<SymbolExport>('export_symbols', { path });
  }
}
