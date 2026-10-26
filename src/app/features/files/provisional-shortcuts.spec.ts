import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { DialogService } from '../../shared/dialog/dialog.service';
import { FilesService } from './files.service';
import { ProvisionalShortcuts } from './provisional-shortcuts';

describe('ProvisionalShortcuts', () => {
  it('maps Ctrl (not macOS) shortcuts to file actions, but not in dialogs or fields', () => {
    TestBed.configureTestingModule({ providers: fakeBackend().providers });
    const files = TestBed.inject(FilesService);
    const save = vi.spyOn(files, 'save').mockResolvedValue(true);
    const redo = vi.spyOn(files, 'redo').mockReturnValue();
    const keys = TestBed.inject(ProvisionalShortcuts);
    const key = (init: KeyboardEventInit, target?: EventTarget) => {
      const e = new KeyboardEvent('keydown', init);
      if (target) Object.defineProperty(e, 'target', { value: target });
      return keys.onKey(e);
    };
    expect(key({ key: 's', ctrlKey: true })).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(key({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(redo).toHaveBeenCalledTimes(1);
    expect(key({ key: 's' })).toBe(false);
    expect(key({ key: 'q', ctrlKey: true })).toBe(false);
    expect(key({ key: 's', ctrlKey: true }, document.createElement('input'))).toBe(false);
    TestBed.inject(DialogService).show('about');
    expect(key({ key: 's', ctrlKey: true })).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
