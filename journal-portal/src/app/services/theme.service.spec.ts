import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  beforeEach(() => {
    localStorage.removeItem('ijdr-theme');
    root.setAttribute('data-theme', 'light');
    TestBed.configureTestingModule({});
  });

  it('starts from the theme already applied to <html> (set before first paint)', () => {
    root.setAttribute('data-theme', 'dark');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
  });

  it('toggle flips the theme, updates both html attributes and persists it', () => {
    const service = TestBed.inject(ThemeService);
    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(root.getAttribute('data-bs-theme')).toBe('dark');
    expect(localStorage.getItem('ijdr-theme')).toBe('dark');
    service.toggle();
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('still applies the theme when storage throws', () => {
    const service = TestBed.inject(ThemeService);
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    expect(() => service.set('dark')).not.toThrow();
    expect(root.getAttribute('data-theme')).toBe('dark');
  });
});
