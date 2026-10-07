import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { FAKE_DATA_PROVIDERS } from './testing/firebase-stubs';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([]), ...FAKE_DATA_PROVIDERS],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it(`should have the 'journal-portal' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance.title).toEqual('journal-portal');
  });

  it('should render a skip link and a focusable main landmark', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(el.querySelector('main#main-content')?.getAttribute('tabindex')).toBe('-1');
  });
});
