import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { treeDocument } from '../../../testing/tree-documents';
import { OS } from '../../core/actions/platform';
import { DocumentStore } from '../document/document.store';
import { FilesService } from '../files/files.service';
import { SettingsStore } from '../settings/settings.store';
import { ColorLibrary } from './color-library';

describe('ColorLibrary (prompt 074 E1/E5)', () => {
  it('document, recent and palette swatches; recent and palette go to the settings', async () => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    TestBed.inject(FilesService).store.set(new DocumentStore(treeDocument()));
    const settings = TestBed.inject(SettingsStore);
    await settings.load();
    const lib = TestBed.inject(ColorLibrary);
    const ids = () => lib.groups().map((g) => g.id);
    expect(ids()).toEqual(['document', 'recent', 'palette']);
    expect(lib.groups()[0].colors).toContain('#FFFFFF');
    lib.used('#f00');
    lib.used('#00ff00');
    lib.used('#FF0000');
    expect(settings.settings().colors.recent).toEqual(['#FF0000', '#00FF00']);
    lib.addToPalette('#123456');
    lib.addToPalette('#123456');
    lib.addToPalette('nonsense');
    expect(lib.groups()[2].colors).toEqual(['#123456']);
  });
});
