import { LucideProvider } from './lucide-provider';
import { PHOSPHOR, TABLER } from './node-set-provider';
import { SymbolLicense, SymbolProvider } from './symbol-provider';

/** A set that ships with the app: its licence is in THIRD-PARTY-NOTICES.txt and the About dialog. */
export type BuiltInSymbolProvider = SymbolProvider & { readonly license: SymbolLicense };

/**
 * The symbol sets of the app (design 013 E16, 084 E1); the first is the default. The user's own
 * symbols ("mine") are added by `SymbolService` (they need the backend).
 */
export const SYMBOL_PROVIDERS: readonly BuiltInSymbolProvider[] = [
  new LucideProvider(),
  TABLER,
  PHOSPHOR,
];
