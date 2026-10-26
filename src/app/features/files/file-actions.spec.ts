import { TestBed } from '@angular/core/testing';
import { ActionService } from '../../core/actions/action.service';
import { OS } from '../../core/actions/platform';
import { FakeIconFileApi } from '../../../testing/fake-icon-file-api';
import { fakeBackend } from '../../../testing/providers';
import { SetAttribute } from '../document/commands';
import { registerFileActions } from './file-actions';
import { FilesService } from './files.service';
import { RecentFilesService } from './recent-files.service';

describe('file actions (design 005 E17)', () => {
  it('follow the document: Save only when needed, Undo with the action name, recent files', async () => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'mac' }],
    });
    const actions = TestBed.inject(ActionService);
    const files = TestBed.inject(FilesService);
    const recent = TestBed.inject(RecentFilesService);
    registerFileActions(actions, files, recent);
    backend.window.start = FakeIconFileApi.CAMSCANNER;
    await files.start();
    expect(actions.enabled('file.save')).toBe(false);
    expect(actions.enabled('edit.undo')).toBe(false);
    expect(actions.label('edit.undo')).toBe('Undo');
    const s = files.store()!;
    const root = [...s.document().assets.values()][0].svg!.root.getAttribute('data-ai-id')!;
    const asset = [...s.document().assets.keys()][0];
    s.execute(new SetAttribute({ asset, id: root }, 'opacity', '0.5'));
    expect(actions.enabled('file.save')).toBe(true);
    expect(actions.label('edit.undo')).toBe('Undo Change Attribute');
    expect(actions.run('edit.undo')).toBe(true);
    expect(actions.label('edit.redo')).toBe('Redo Change Attribute');
    // the opened file is the first recent one
    expect(actions.enabled('file.recent.1')).toBe(true);
    expect(actions.label('file.recent.1')).toBe('camscanner.icon');
    expect(actions.enabled('file.recent.2')).toBe(false);
    expect(actions.enabled('file.clearRecent')).toBe(true);
  });
});
