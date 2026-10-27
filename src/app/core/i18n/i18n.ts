// Übernommen aus editlicious src/app/core/i18n/i18n.ts (Prompt 009, dort aus files-and-folders
// Design 015 E5); erweitert um den tiefen Proxy (Design 015 E13).
import { signal } from '@angular/core';

/**
 * Runtime i18n without a library (design 015 E13). English is the source; a catalog is a typed
 * object of strings and functions. {@link translatable} returns a proxy that reads the language
 * signal on every access – templates and `computed`s follow a language switch without a reload,
 * and components keep `readonly t = XX_TEXTS`. The proxy is deep: a sub-object kept in a constant
 * (`const T = TOOLS_TEXTS.symbol`) follows the language too.
 */
export type Language = 'en' | 'de';

/** Same keys and signatures as the English catalog, strings widened. */
export type Translation<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Translation<R>
  : T extends string
    ? string
    : T extends readonly (infer E)[]
      ? readonly Translation<E>[]
      : T extends object
        ? { readonly [K in keyof T]: Translation<T[K]> }
        : T;

const current = signal<Language>('en');

/** The UI language (reactive). */
export const language = current.asReadonly();

export function setLanguage(lang: Language): void {
  current.set(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

function systemLocales(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** The language of the system: German if the first preferred language is German, else English. */
export function systemLanguage(locales: readonly string[] = systemLocales()): Language {
  const first = (locales[0] ?? '').toLowerCase();
  return first === 'de' || first.startsWith('de-') ? 'de' : 'en';
}

/** All catalogs (completeness test). */
export const CATALOGS = new Map<
  string,
  { readonly en: object; readonly tr: Readonly<Record<string, object>> }
>();
/** Phrase books keyed by the English text (long label lists, e.g. SVG property names). */
export const PHRASEBOOKS = new Map<
  string,
  Readonly<Record<string, Readonly<Record<string, string>>>>
>();

function isPlain(v: unknown): v is Record<PropertyKey, unknown> {
  return typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
}

/** The value at `path` of the translation `lang`, `undefined` if there is none. */
function lookup(
  tr: Readonly<Record<string, object>>,
  lang: Language,
  path: readonly PropertyKey[],
): unknown {
  let v: unknown = tr[lang];
  for (const k of path) {
    if (!isPlain(v)) return undefined;
    v = v[k];
  }
  return v;
}

function deep<T extends object>(
  en: T,
  tr: Readonly<Record<string, object>>,
  path: readonly PropertyKey[],
): T {
  const children = new Map<PropertyKey, object>();
  return new Proxy(en, {
    get(target, prop, receiver) {
      const base = Reflect.get(target, prop, receiver);
      if (typeof prop === 'symbol') return base;
      if (isPlain(base)) {
        let child = children.get(prop);
        if (!child) {
          child = deep(base, tr, [...path, prop]);
          children.set(prop, child);
        }
        return child;
      }
      const lang = current();
      if (lang !== 'en') {
        const parent = lookup(tr, lang, path);
        if (isPlain(parent) && prop in parent && parent[prop] !== undefined) return parent[prop];
      }
      return base;
    },
  });
}

/**
 * A catalog that follows the language. A key missing in a translation (never with the types, but
 * e.g. in a hot-reloaded partial file) falls back to English.
 */
export function translatable<T extends object>(
  name: string,
  en: T,
  tr: { readonly de: Translation<T> },
): Translation<T> {
  CATALOGS.set(name, { en, tr: tr as Record<string, object> });
  return deep(en, tr as Record<string, object>, []) as unknown as Translation<T>;
}

/** Translates an English text through a phrase book (reactive); unknown texts stay English. */
export function phrasebook(
  name: string,
  tr: { readonly de: Readonly<Record<string, string>> },
): (en: string) => string {
  PHRASEBOOKS.set(name, tr);
  return (en) => {
    const lang = current();
    return lang === 'en' ? en : (tr[lang]?.[en] ?? en);
  };
}
