import { TestBed } from '@angular/core/testing';
import { fakeBackend } from '../../../testing/providers';
import { OS } from '../../core/actions/platform';
import { AboutDialog } from './about-dialog';

describe('AboutDialog (design 030 E7)', () => {
  it('shows version, repository and the licence texts on demand', async () => {
    const backend = fakeBackend();
    TestBed.configureTestingModule({
      providers: [...backend.providers, { provide: OS, useValue: 'other' }],
    });
    const fixture = TestBed.createComponent(AboutDialog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('0.0.0-test');
    expect(el.querySelector('a[href="https://github.com/krocon/app-iconic"]')).not.toBeNull();
    expect(el.querySelector('pre.notices')).toBeNull();
    (el.querySelector('[data-testid="about-notices"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('pre.notices')!.textContent).toContain('lucide-static');
  });
});
