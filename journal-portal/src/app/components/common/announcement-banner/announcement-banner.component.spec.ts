import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AnnouncementBannerComponent } from './announcement-banner.component';
import { SiteSettingsService } from '../../../services/site-settings.service';
import { Announcement } from '../../../type/journals.type';

describe('AnnouncementBannerComponent', () => {
  let data$: BehaviorSubject<Announcement | undefined>;
  let fixture: ComponentFixture<AnnouncementBannerComponent>;
  const text = () => (fixture.nativeElement as HTMLElement).querySelector('.announcement-text');

  function create(a?: Announcement) {
    data$ = new BehaviorSubject<Announcement | undefined>(a);
    TestBed.configureTestingModule({
      imports: [AnnouncementBannerComponent],
      providers: [
        provideRouter([]),
        { provide: SiteSettingsService, useValue: { getAnnouncement: () => data$ } },
      ],
    });
    fixture = TestBed.createComponent(AnnouncementBannerComponent);
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.removeItem('ijdr-announcement-dismissed'));

  it('renders nothing when there is no announcement or it is disabled', () => {
    create(undefined);
    expect(text()).toBeNull();
  });

  it('renders nothing when disabled', () => {
    create({ enabled: false, text: 'Hello' });
    expect(text()).toBeNull();
  });

  it('shows enabled text with a safe link', () => {
    create({ enabled: true, text: 'Call for papers', linkUrl: '/contribute', linkLabel: 'Submit' });
    expect(text()?.textContent).toContain('Call for papers');
    expect(text()?.querySelector('a')?.textContent).toContain('Submit');
  });

  it('drops an unsafe link but still shows the text', () => {
    create({ enabled: true, text: 'Notice', linkUrl: 'javascript:alert(1)' });
    expect(text()?.textContent).toContain('Notice');
    expect(text()?.querySelector('a')).toBeNull();
  });

  it('dismiss hides the banner and stays hidden for the same version', () => {
    const a: Announcement = { enabled: true, text: 'Notice', updatedAt: { seconds: 100 } };
    create(a);
    fixture.componentInstance.dismiss();
    fixture.detectChanges();
    expect(text()).toBeNull();
    TestBed.resetTestingModule();
    create(a);
    expect(text()).toBeNull();
  });

  it('reappears after the admin saves a new version', () => {
    create({ enabled: true, text: 'Notice', updatedAt: { seconds: 100 } });
    fixture.componentInstance.dismiss();
    TestBed.resetTestingModule();
    create({ enabled: true, text: 'Notice', updatedAt: { seconds: 200 } });
    expect(text()).not.toBeNull();
  });
});
