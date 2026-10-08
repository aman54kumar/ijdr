import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, combineLatest } from 'rxjs';
import { ArticleService } from '../../services/article.service';
import { iArticle } from '../../type/journals.type';
import {
  applyFilters,
  ArticleFilters,
  buildFacets,
  Facets,
  FILTER_KEYS,
  filtersFromParams,
} from '../../utils/article-filter.util';

const PAGE = 20;

/** Public browse page at /articles; every filter lives in the URL so views are shareable. */
@Component({
  selector: 'app-articles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './articles.component.html',
  styleUrl: './articles.component.scss',
})
export class ArticlesComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private articles = inject(ArticleService);
  private sub: Subscription;

  all: iArticle[] = [];
  facets: Facets = { years: [], issues: [], authors: [], keywords: [], subjects: [] };
  filters: ArticleFilters = {};
  results: iArticle[] = [];
  shown = PAGE;
  loading = true;
  failed = false;
  qDraft = '';

  constructor() {
    this.sub = combineLatest([this.articles.getPublishedCorpus(), this.route.queryParamMap]).subscribe({
      next: ([all, params]) => {
        this.all = all;
        this.facets = buildFacets(all);
        this.filters = filtersFromParams((k) => params.get(k));
        this.qDraft = this.filters.q ?? '';
        this.results = applyFilters(all, this.filters);
        this.shown = PAGE;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.failed = true;
      },
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  get active(): { key: keyof ArticleFilters; label: string }[] {
    return FILTER_KEYS.filter((k) => this.filters[k]).map((k) => ({
      key: k,
      label: k === 'issue' ? (this.facets.issues.find((i) => i.id === this.filters.issue)?.label ?? 'Issue') : `${this.filters[k]}`,
    }));
  }

  set(key: keyof ArticleFilters, value: string | undefined) {
    const queryParams: Record<string, string | null> = { [key]: value?.trim() || null };
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  clearAll() {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  more() {
    this.shown += PAGE;
  }

  authorLine(a: iArticle): string {
    const names = a.authors.slice(0, 3).map((x) => x.name);
    return names.join(', ') + (a.authors.length > 3 ? ' et al.' : '');
  }
}
