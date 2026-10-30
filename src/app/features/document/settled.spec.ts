import { signal } from '@angular/core';
import { DocumentStore } from './document.store';
import { settledComputed } from './settled';

describe('settledComputed (prompt 033 E4)', () => {
  it('holds its value while a gesture runs and follows again after it', () => {
    const gesture = signal(false);
    const store = { gesture } as unknown as DocumentStore;
    const source = signal(1);
    let runs = 0;
    const value = settledComputed(
      () => store,
      () => {
        runs++;
        return source() * 10;
      },
    );
    expect(value()).toBe(10);
    gesture.set(true);
    source.set(2);
    expect(value()).toBe(10);
    source.set(3);
    expect(value()).toBe(10);
    gesture.set(false);
    expect(value()).toBe(30);
    expect(runs).toBe(2);
  });

  it('computes for a new store even during its gesture, and without a store', () => {
    const a = { gesture: signal(true) } as unknown as DocumentStore;
    const b = { gesture: signal(true) } as unknown as DocumentStore;
    const current = signal<DocumentStore | null>(null);
    const source = signal(1);
    const value = settledComputed(
      () => current(),
      () => source(),
    );
    expect(value()).toBe(1);
    current.set(a);
    source.set(2);
    expect(value()).toBe(2);
    current.set(b);
    source.set(3);
    expect(value()).toBe(3);
  });
});
