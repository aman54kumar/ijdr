import { ComponentFixture, TestBed } from '@angular/core/testing';
import { IssueCoverComponent } from './issue-cover.component';

describe('IssueCoverComponent', () => {
  let fixture: ComponentFixture<IssueCoverComponent>;
  const issue = { title: 'Jan-Jun 2024', volume: 16, number: 1, year: '2024' };

  function create(coverUrl?: string) {
    fixture = TestBed.createComponent(IssueCoverComponent);
    fixture.componentRef.setInput('issue', { ...issue, coverUrl });
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [IssueCoverComponent] }));

  it('shows a labelled placeholder when there is no cover', () => {
    const el = create();
    expect(el.querySelector('img:not(.cover-logo)')).toBeNull();
    expect(el.textContent).toContain('Vol 16');
    expect(el.textContent).toContain('No. 1');
  });

  it('shows the cover image lazily, with reserved dimensions', () => {
    const img = create('https://example.org/c.jpg').querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://example.org/c.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('width')).toBe('400');
    expect(img.getAttribute('height')).toBe('560');
  });

  it('falls back to the placeholder if the image fails to load', () => {
    const el = create('https://example.org/broken.jpg');
    el.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el.querySelector('.cover--placeholder')).not.toBeNull();
  });
});
