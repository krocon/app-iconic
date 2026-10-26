import { TestBed } from '@angular/core/testing';
import { DialogService } from '../dialog/dialog.service';
import { AskService } from './ask.service';

describe('AskService', () => {
  const q = (title: string) => ({
    title,
    message: 'm',
    buttons: [{ id: 'ok', label: 'OK', primary: true }],
    cancel: 'cancel',
  });

  it('asks one question at a time and answers cancel on Escape', async () => {
    const ask = TestBed.inject(AskService);
    const dialogs = TestBed.inject(DialogService);
    const first = ask.ask(q('a'));
    const second = ask.ask(q('b'));
    await Promise.resolve();
    expect(ask.current()?.title).toBe('a');
    expect(dialogs.open()).toBe('ask');
    ask.answer('ok');
    expect(await first).toBe('ok');
    await Promise.resolve();
    await Promise.resolve();
    expect(ask.current()?.title).toBe('b');
    ask.answer(null);
    expect(await second).toBe('cancel');
    expect(dialogs.open()).toBeNull();
  });
});
