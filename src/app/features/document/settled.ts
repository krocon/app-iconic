import { computed, Signal } from '@angular/core';
import { DocumentStore } from './document.store';

/**
 * A `computed` that holds its last value while a gesture of the current store runs (drag, live
 * field edit) and computes again when it ends (prompt 033 E4). For views that read the whole
 * document but need not follow every step – menus, the Add sidebar, the document's colours (the
 * tree does the same since 031). Dependencies read by `fn` count only outside gestures.
 */
export function settledComputed<T>(
  store: () => DocumentStore | null | undefined,
  fn: () => T,
): Signal<T> {
  let last: { store: DocumentStore | null | undefined; value: T } | null = null;
  return computed(() => {
    const s = store();
    if (s?.gesture() && last && last.store === s) return last.value;
    const value = fn();
    last = { store: s, value };
    return value;
  });
}
