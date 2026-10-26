import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { FilesService } from './files.service';
import { RecentMenu } from './recent-menu';

describe('RecentMenu', () => {
  it('lists existing recent files, opens one and clears the menu', async () => {
    const backend = fakeBackend();
    backend.recent.paths = ['/a/one.icon', '/b/gone.icon'];
    backend.recent.missing.add('/b/gone.icon');
    TestBed.configureTestingModule({ imports: [RecentMenu], providers: backend.providers });
    const openRecent = vi.spyOn(TestBed.inject(FilesService), 'openRecent').mockResolvedValue();
    const fixture = TestBed.createComponent(RecentMenu);
    const el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    const items = [...el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((i) => i.textContent?.trim())).toEqual(['one.icon', 'Clear Menu']);
    items[0].click();
    expect(openRecent).toHaveBeenCalledWith('/a/one.icon');
    el.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    [...el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].at(-1)!.click();
    await new Promise((r) => setTimeout(r));
    el.querySelector<HTMLButtonElement>('button')!.click();
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    const empty = [...el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(empty.map((i) => [i.textContent?.trim(), i.disabled])).toEqual([
      ['No Recent Items', true],
      ['Clear Menu', true],
    ]);
  });
});
