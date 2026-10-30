import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ColorButton } from './color-button';
import { ColorSwatches, SwatchGroup } from './color-swatches';
import { parseAny } from './color-picker';

class Swatches extends ColorSwatches {
  usedColors: string[] = [];
  palette: string[] = [];
  groups(): readonly SwatchGroup[] {
    return [{ id: 'document', label: 'Document', colors: ['#112233'] }];
  }
  used(c: string): void {
    this.usedColors.push(c);
  }
  addToPalette(c: string): void {
    this.palette.push(c);
  }
}

@Component({
  imports: [ColorButton],
  template: `
    <app-color-button
      testId="chip"
      label="Fill"
      [value]="value()"
      (edited)="edits.push($event)"
      (committed)="commits = commits + 1"
      (reverted)="reverts = reverts + 1"
    />
  `,
})
class Host {
  value = signal<string | null>('rgb(255, 0, 0)');
  edits: string[] = [];
  commits = 0;
  reverts = 0;
}

describe('colour popover (prompt 074 E1)', () => {
  let swatches: Swatches;

  async function open() {
    swatches = new Swatches();
    TestBed.configureTestingModule({ providers: [{ provide: ColorSwatches, useValue: swatches }] });
    const f = TestBed.createComponent(Host);
    document.body.appendChild(f.nativeElement);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    el.querySelector<HTMLButtonElement>('[data-testid="chip"]')!.click();
    await f.whenStable();
    return { f, el, picker: () => el.querySelector<HTMLElement>('[data-testid="color-picker"]') };
  }

  it('opens as a dialog; typed values and swatches are live, written like the old value', async () => {
    const { f, el, picker } = await open();
    expect(picker()!.getAttribute('role')).toBe('dialog');
    expect(el.querySelector('[data-testid="chip"]')!.getAttribute('aria-expanded')).toBe('true');
    const text = picker()!.querySelector<HTMLInputElement>('[data-testid="color-text"]')!;
    text.value = '#00ff00';
    text.dispatchEvent(new Event('change'));
    expect(f.componentInstance.edits.at(-1)).toBe('rgb(0, 255, 0)');
    picker()!.querySelector<HTMLButtonElement>('[data-color="#112233"]')!.click();
    expect(f.componentInstance.edits.at(-1)).toBe('rgb(17, 34, 51)');
    const alpha = picker()!.querySelector<HTMLInputElement>('[data-testid="color-alpha"]')!;
    alpha.value = '50';
    alpha.dispatchEvent(new Event('input'));
    expect(f.componentInstance.edits.at(-1)).toBe('rgba(17, 34, 51, 0.5)');
    picker()!.querySelector<HTMLButtonElement>('[data-testid="color-add"]')!.click();
    expect(swatches.palette).toEqual(['#11223380']);
    picker()!.querySelector<HTMLButtonElement>('[data-testid="color-done"]')!.click();
    await f.whenStable();
    expect(f.componentInstance.commits).toBe(1);
    expect(swatches.usedColors).toEqual(['#11223380']);
    expect(picker()).toBeNull();
    f.nativeElement.remove();
  });

  it('arrows move in the area, Esc takes it back', async () => {
    const { f, picker } = await open();
    const sv = picker()!.querySelector<HTMLElement>('.sv')!;
    sv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // red at 99 % brightness
    expect(f.componentInstance.edits.at(-1)).toBe('rgb(252, 0, 0)');
    sv.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await f.whenStable();
    expect(f.componentInstance.reverts).toBe(1);
    expect(picker()).toBeNull();
    f.nativeElement.remove();
  });

  it('reads every input format', () => {
    expect(parseAny('#f00')).toMatchObject({ r: 255, g: 0, b: 0 });
    expect(parseAny('hsb(120 100% 100%)')).toMatchObject({ g: 255 });
    expect(parseAny('oklch(62.8% 0.2577 29.23)')!.r).toBeGreaterThan(250);
    expect(parseAny('')).toBeNull();
  });
});
