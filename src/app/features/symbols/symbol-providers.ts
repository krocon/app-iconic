import { LucideProvider } from './lucide-provider';
import { SymbolProvider } from './symbol-provider';

/** The symbol sets of the app (design 013 E16); the first is the default. */
export const SYMBOL_PROVIDERS: readonly SymbolProvider[] = [new LucideProvider()];
