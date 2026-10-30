import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SegmentedField } from './segmented-field';

@Component({
  imports: [SegmentedField],
  template: `
    <app-segmented-field
      fieldId="cap"
      label="Line Cap"
      [value]="value()"
      [placeholder]="'butt'"
      [mixed]="mixed()"
      [options]="['butt', 'round', 'square']"
      [optionLabels]="{ butt: 'Butt', round: 'Round', square: 'Square' }"
      [icons]="{ butt: { d: 'M1 1h1' } }"
      (edited)="edits.push($event)"
      (committed)="commits = commits + 1"
    />
  `,
})
class Host {
  value = signal<string | null>(null);
  mixed = signal(false);
  edits: (string | null)[] = [];
  commits = 0;
}

describe('SegmentedField (prompt 073 E2)', () => {
  async function render() {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const radios = () => [...el.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    return { f, el, radios };
  }

  it('is a radio group: the fallback outlined, the checked one tabbable, a click chooses', async () => {
    const { f, el, radios } = await render();
    expect(el.querySelector('[role="radiogroup"]')!.getAttribute('aria-labelledby')).toBe(
      'cap-label',
    );
    expect(radios().map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ]);
    expect(radios()[0].classList.contains('fallback')).toBe(true);
    expect(radios()[0].tabIndex).toBe(0);
    expect(radios()[1].getAttribute('aria-label')).toBe('Round');
    expect(radios()[1].title).toBe('Round – round');
    radios()[1].click();
    expect(f.componentInstance.edits).toEqual(['round']);
    expect(f.componentInstance.commits).toBe(1);
    f.componentInstance.value.set('round');
    await f.whenStable();
    expect(radios()[1].getAttribute('aria-checked')).toBe('true');
    expect(radios()[1].tabIndex).toBe(0);
    expect(radios()[0].tabIndex).toBe(-1);
  });

  it('arrows move and choose, wrapping; mixed checks none', async () => {
    const { f, radios } = await render();
    f.componentInstance.value.set('square');
    await f.whenStable();
    radios()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(f.componentInstance.edits).toEqual(['butt']);
    f.componentInstance.value.set('butt');
    await f.whenStable();
    radios()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(f.componentInstance.edits).toEqual(['butt', 'square']);
    f.componentInstance.mixed.set(true);
    await f.whenStable();
    expect(radios().every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });
});
