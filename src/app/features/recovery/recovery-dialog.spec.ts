import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { DialogService } from '../../shared/dialog/dialog.service';
import { RecoveryDialog } from './recovery-dialog';
import { RecoveryService } from './recovery.service';

/** The offer at start (prompt 083 E5): names, places, Restore / Discard per entry, Later. */
describe('RecoveryDialog', () => {
  async function setup() {
    const backend = fakeBackend();
    TestBed.configureTestingModule({ providers: backend.providers });
    const service = TestBed.inject(RecoveryService);
    const dialogs = TestBed.inject(DialogService);
    service.entries.set([
      { id: 'a-1', path: '/x/b.icon', name: 'b.icon', location: '/x', savedAt: 2000 },
      { id: 'a-2', path: null, name: null, location: null, savedAt: 1000 },
    ]);
    dialogs.show('recovery');
    const fixture = TestBed.createComponent(RecoveryDialog);
    await fixture.whenStable();
    return { service, dialogs, fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists every snapshot with its place; buttons name their document', async () => {
    const { el } = await setup();
    expect(el.querySelector('[role="dialog"]')!.getAttribute('aria-describedby')).toBe(
      'recovery-intro',
    );
    const rows = [...el.querySelectorAll('[data-testid="recovery-entry"]')];
    expect(rows.map((r) => r.querySelector('.name')!.textContent!.trim())).toEqual([
      'b.icon',
      'Untitled',
    ]);
    expect(rows[1].textContent).toContain('Never saved');
    const restore = [...el.querySelectorAll('[data-testid="recovery-restore"]')];
    expect(restore.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Restore b.icon',
      'Restore Untitled',
    ]);
    expect(restore[0].hasAttribute('data-autofocus')).toBe(true);
  });

  it('Restore and Discard go to the service; Later closes', async () => {
    const { el, service, dialogs, fixture } = await setup();
    const restore = vi.spyOn(service, 'restore').mockResolvedValue(true);
    const discard = vi.spyOn(service, 'discard').mockResolvedValue();
    (el.querySelectorAll('[data-testid="recovery-restore"]')[1] as HTMLButtonElement).click();
    (el.querySelectorAll('[data-testid="recovery-discard"]')[0] as HTMLButtonElement).click();
    expect(restore).toHaveBeenCalledWith('a-2');
    expect(discard).toHaveBeenCalledWith('a-1');
    service.entries.set([]);
    await fixture.whenStable();
    expect(el.textContent).toContain('There are no unsaved documents to recover.');
    (el.querySelector('[data-testid="recovery-later"]') as HTMLButtonElement).click();
    expect(dialogs.open()).toBeNull();
  });
});
