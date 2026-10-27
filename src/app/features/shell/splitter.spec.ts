import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LayoutStore } from './layout.store';
import { Splitter } from './splitter';

@Component({
  imports: [Splitter],
  template: `
    <app-splitter panel="hierarchy" side="end" name="Hierarchy" />
    <app-splitter panel="properties" side="start" name="Properties" />
  `,
})
class Host {
  readonly layout = inject(LayoutStore);
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const [left, right] = [
    ...fixture.nativeElement.querySelectorAll('app-splitter'),
  ] as HTMLElement[];
  const layout = TestBed.inject(LayoutStore);
  const key = (el: HTMLElement, k: string, shiftKey = false) => {
    const e = new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    fixture.detectChanges();
    return e.defaultPrevented;
  };
  return { fixture, left, right, layout, key };
}

describe('Splitter (design 015 E10)', () => {
  it('is an APG window splitter with the width as value', () => {
    const { left } = setup();
    expect(left.getAttribute('role')).toBe('separator');
    expect(left.getAttribute('tabindex')).toBe('0');
    expect(left.getAttribute('aria-orientation')).toBe('vertical');
    expect(left.getAttribute('aria-valuenow')).toBe('260');
    expect(left.getAttribute('aria-valuemin')).toBe('160');
    expect(left.getAttribute('aria-valuemax')).toBe('480');
    expect(left.getAttribute('aria-label')).toBe('Resize Hierarchy');
  });

  it('keys change the width within 160…480 and take the key from the dispatcher', () => {
    const { left, right, layout, key } = setup();
    expect(key(left, 'ArrowRight')).toBe(true);
    expect(layout.widths().hierarchy).toBe(270);
    key(left, 'ArrowLeft', true);
    expect(layout.widths().hierarchy).toBe(230);
    key(left, 'End');
    expect(layout.widths().hierarchy).toBe(480);
    expect(left.getAttribute('aria-valuenow')).toBe('480');
    key(left, 'Enter');
    expect(layout.widths().hierarchy).toBe(260);
    // the right panel's splitter sits on its left edge: ← widens it
    key(right, 'ArrowLeft');
    expect(layout.widths().properties).toBe(310);
    key(right, 'Home');
    expect(layout.widths().properties).toBe(160);
    expect(key(left, 'ArrowUp')).toBe(false);
  });

  it('double-click restores the default width', () => {
    const { left, layout, fixture } = setup();
    layout.setWidth('hierarchy', 400);
    left.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(layout.widths().hierarchy).toBe(260);
  });

  it('dragging with the pointer', () => {
    const { left, layout, fixture } = setup();
    const ev = (type: string, clientX: number) => {
      const e = new MouseEvent(type, { clientX, button: 0, bubbles: true, cancelable: true });
      Object.defineProperty(e, 'pointerId', { value: 1 });
      left.dispatchEvent(e);
      fixture.detectChanges();
    };
    ev('pointerdown', 100);
    ev('pointermove', 150);
    expect(layout.widths().hierarchy).toBe(310);
    ev('pointermove', 1000);
    expect(layout.widths().hierarchy).toBe(480);
    ev('pointerup', 1000);
    ev('pointermove', 0);
    expect(layout.widths().hierarchy).toBe(480);
  });
});
