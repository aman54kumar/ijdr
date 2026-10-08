import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, switchMap, of, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ArticleService } from '../../services/article.service';
import { ArticleSeoService } from '../../services/article-seo.service';
import { ToastService } from '../../services/toast.service';
import { iArticle } from '../../type/journals.type';
import {
  articleUrl,
  CITATION_FORMATS,
  CitationFormat,
  formatCitation,
} from '../../utils/citation.util';

@Component({
  selector: 'app-article-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './article-detail.component.html',
  styleUrl: './article-detail.component.scss',
})
export class ArticleDetailComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private articles = inject(ArticleService);
  private seo = inject(ArticleSeoService);
  private toast = inject(ToastService);
  private sub: Subscription;

  article?: iArticle;
  related: iArticle[] = [];
  loading = true;
  notFound = false;

  readonly formats = CITATION_FORMATS;
  citeOpen = false;
  citeFormat: CitationFormat = 'apa';
  readonly canShare = typeof navigator !== 'undefined' && !!navigator.share;

  constructor() {
    this.sub = this.route.paramMap
      .pipe(
        map((p) => p.get('id') ?? ''),
        switchMap((id) => {
          this.loading = true;
          this.notFound = false;
          this.related = [];
          this.citeOpen = false;
          return id ? this.articles.getArticle(id) : of(undefined);
        })
      )
      .subscribe({
        next: (a) => this.show(a && a.status === 'published' ? a : undefined),
        // Drafts and missing docs both surface as a permission error to anonymous users.
        error: () => this.show(undefined),
      });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.seo.clear();
  }

  private show(a: iArticle | undefined) {
    this.loading = false;
    if (!a) {
      this.article = undefined;
      this.notFound = true;
      this.seo.clear();
      return;
    }
    const first = this.article?.id !== a.id;
    this.article = a;
    this.seo.apply(a);
    if (first) {
      this.articles.getRelated(a).subscribe({ next: (r) => (this.related = r), error: () => (this.related = []) });
      this.countView(a.id);
    }
  }

  private countView(id: string) {
    const key = `ijdr_viewed_article_${id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* storage blocked: count once per page load */
    }
    this.articles.incrementViewCount(id).catch(() => {
      /* a missed view is not worth a toast */
    });
  }

  get url(): string {
    return this.article ? articleUrl(environment.siteUrl, this.article.id) : '';
  }

  get pages(): string {
    const a = this.article;
    if (!a?.pageStart) return '';
    return a.pageEnd && a.pageEnd !== a.pageStart ? `pages ${a.pageStart}–${a.pageEnd}` : `page ${a.pageStart}`;
  }

  get citation() {
    return this.article ? formatCitation(this.citeFormat, this.article, environment.siteUrl) : { text: '' };
  }

  async copyCitation() {
    try {
      await navigator.clipboard.writeText(this.citation.text);
      this.toast.show('Citation copied.', 'success');
    } catch {
      this.toast.show('Could not copy. Select the text and copy it manually.', 'warning');
    }
  }

  downloadCitation() {
    const f = CITATION_FORMATS.find((x) => x.id === this.citeFormat)!;
    const blob = new Blob([this.citation.text + '\n'], { type: `${f.mime};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ijdr-${this.article!.id}.${f.ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async share() {
    if (!this.article) return;
    try {
      await navigator.share({ title: this.article.title, url: this.url });
    } catch {
      /* user cancelled */
    }
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.url);
      this.toast.show('Link copied.', 'success');
    } catch {
      this.toast.show('Could not copy the link.', 'warning');
    }
  }
}
