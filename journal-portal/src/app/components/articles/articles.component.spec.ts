import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ArticleService } from '../../services/article.service';
import { iArticle } from '../../type/journals.type';
import { ArticlesComponent } from './articles.component';

const art = {
  id: 'a1', issueId: 'i1', issueTitle: 'Jan-Jun 2024', issueYear: '2024', issueVolume: 16, issueNumber: 1,
  title: 'Rural credit', authors: [{ name: 'Ann Lee' }], keywords: ['Credit'], status: 'published',
} as iArticle;

describe('ArticlesComponent', () => {
  let fixture: ComponentFixture<ArticlesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArticlesComponent],
      providers: [provideRouter([]), { provide: ArticleService, useValue: { getPublishedCorpus: () => of([art]) } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ArticlesComponent);
    fixture.detectChanges();
  });

  it('lists published articles with links', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')?.textContent).toContain('Articles');
    expect(el.querySelector('.result a')?.getAttribute('href')).toBe('/article/a1');
    expect(el.textContent).toContain('1 article');
  });
});
