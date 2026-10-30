import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { camscannerDocument } from '../../../testing/documents';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { DialogService } from '../../shared/dialog/dialog.service';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { registerMockupsActions } from './mockups-actions';
import { MockupsDialog } from './mockups-dialog';
import { MockupsService } from './mockups.service';

describe('MockupsDialog (prompt 081)', () => {
  it('a non-modal popover: every scene labelled, appearance radios, keyboard controls', async () => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    TestBed.inject(FilesService).store.set(new DocumentStore(camscannerDocument()));
    const service = TestBed.inject(MockupsService);
    registerMockupsActions(TestBed.inject(ActionService), service);
    TestBed.inject(DialogService).show('mockups');
    const fixture = TestBed.createComponent(MockupsDialog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.hasAttribute('aria-modal')).toBe(false);
    const sections = [...el.querySelectorAll('section.scene')];
    expect(sections.map((s) => s.getAttribute('data-testid'))).toEqual([
      'scene-dock',
      'scene-homeLight',
      'scene-homeDark',
      'scene-spotlight',
      'scene-taskbar',
    ]);
    for (const s of sections) {
      const id = s.getAttribute('aria-labelledby')!;
      expect(el.querySelector(`#${id}`)!.textContent!.length).toBeGreaterThan(3);
      expect(s.querySelectorAll('input[type="radio"]')).toHaveLength(3);
    }
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(el.querySelectorAll('section.scene img')).toHaveLength(5);
    });
    const img = el.querySelector<HTMLImageElement>('[data-testid="scene-homeDark"] img')!;
    expect(img.alt).toBe('camscanner in iOS Home Screen (dark), Dark');
    expect([img.width, img.height]).toEqual([360, 292]);
    // a radio runs the action
    const tinted = el.querySelectorAll<HTMLInputElement>(
      '[data-testid="scene-dock"] input[type="radio"]',
    )[2];
    tinted.click();
    expect(service.appearances().dock).toBe('tinted');
    // copy button
    el.querySelector<HTMLButtonElement>('[data-testid="scene-taskbar"] .actions button')!.click();
    await vi.waitFor(() => expect(backend.exporter.scenes).toHaveLength(1));
    expect(backend.exporter.scenes[0].svg).toContain('data-scene="taskbar"');
  });
});
