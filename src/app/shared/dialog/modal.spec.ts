import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DialogService } from './dialog.service';
import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    @if (dialogs.open()) {
      <app-modal heading="Corners" (closed)="closed = closed + 1; dialogs.close()">
        <input data-autofocus class="first" />
        <button type="button" class="last">OK</button>
      </app-modal>
    }
  `,
})
class Host {
  protected readonly dialogs = inject(DialogService);
  closed = 0;
}

describe('Modal as popover (prompt 073 E3)', () => {
  it('a popover: no aria-modal, no backdrop clicks, focus in and back, Esc closes, no trap', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const f = TestBed.createComponent(Host);
    document.body.appendChild(f.nativeElement);
    const dialogs = TestBed.inject(DialogService);
    dialogs.show('corners');
    expect(dialogs.popover()).toBe(true);
    expect(dialogs.modal()).toBe(false);
    await f.whenStable();
    await new Promise((r) => setTimeout(r));
    const el = f.nativeElement as HTMLElement;
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.hasAttribute('aria-modal')).toBe(false);
    expect(dialog.hasAttribute('data-popover')).toBe(true);
    expect(document.activeElement).toBe(el.querySelector('.first'));
    // Tab from the last field is not trapped
    const last = el.querySelector<HTMLElement>('.last')!;
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    el.querySelector('.first')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(f.componentInstance.closed).toBe(1);
    await new Promise((r) => setTimeout(r));
    expect(document.activeElement).toBe(opener);
    opener.remove();
    f.nativeElement.remove();
  });

  it('a modal dialog keeps aria-modal and traps Tab', async () => {
    const f = TestBed.createComponent(Host);
    document.body.appendChild(f.nativeElement);
    TestBed.inject(DialogService).show('about');
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
    const last = el.querySelector<HTMLElement>('.last')!;
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    f.nativeElement.remove();
  });
});
