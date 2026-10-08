import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { ArticleService } from '../../services/article.service';
import { AnalyticsEventsService } from '../../services/analytics-events.service';
import { ToastService } from '../../services/toast.service';
import { iArticle, iJournal } from '../../type/journals.type';
import { environment } from '../../../environments/environment';
import { PdfReaderComponent } from '../pdf-reader/pdf-reader.component';

/** Full-issue page at /journal/:id, built on the shared PDF reader. `?page=N` deep-links to a page. */
@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule, RouterLink, PdfReaderComponent],
  template: `
    <div class="viewer-page">
      <div class="viewer-head">
        <div class="container-fluid d-flex flex-wrap justify-content-between align-items-center gap-2 py-2">
          <div>
            <h1 class="h5 mb-0" *ngIf="journal">{{ journal.title }}</h1>
            <small class="text-muted" *ngIf="journal">Volume {{ journal.volume }}, Issue {{ journal.number }} • {{ journal.year }}</small>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <a *ngIf="articles.length" routerLink="/articles" [queryParams]="{ issue: journal?.id }" class="btn btn-outline-primary btn-sm">
              <i class="bi bi-list-ul me-1"></i>{{ articles.length }} articles
            </a>
            <button type="button" class="btn btn-outline-primary btn-sm" (click)="goBack()"><i class="bi bi-arrow-left"></i> Back</button>
          </div>
        </div>
      </div>

      <div *ngIf="error" class="text-center py-5">
        <div class="alert alert-danger mx-auto" style="max-width: 500px">
          <i class="bi bi-exclamation-triangle"></i> {{ error }}
        </div>
        <button class="btn btn-primary" (click)="goBack()">Go back</button>
      </div>

      <app-pdf-reader *ngIf="journal && !error" [journal]="journal" [articles]="articles" [page]="page" (pageChange)="onPageChange($event)"></app-pdf-reader>
      <p *ngIf="!journal && !error" class="text-center text-muted py-5" role="status">Loading…</p>
    </div>
  `,
  styles: [
    `
      .viewer-page {
        background: var(--surface-2);
        min-height: 100vh;
      }
      .viewer-head {
        background: var(--surface);
        border-bottom: 1px solid var(--border);
        color: var(--text);
      }
    `,
  ],
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  journal: iJournal | null = null;
  error: string | null = null;
  articles: iArticle[] = [];
  page: number | null = null;

  private document = inject(DOCUMENT);
  private subs = new Subscription();
  private urlTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firebaseService: FirebaseJournalService,
    private articleService: ArticleService,
    private analytics: AnalyticsEventsService,
    private toast: ToastService,
    private title: Title,
    private meta: Meta
  ) {}

  ngOnInit() {
    const journalId = this.route.snapshot.paramMap.get('id');
    if (!journalId) {
      this.error = 'No journal ID provided';
      return;
    }
    this.subs.add(
      this.route.queryParamMap.subscribe((q) => {
        const p = parseInt(q.get('page') ?? '', 10);
        this.page = p > 0 ? p : null;
      })
    );
    this.loadJournal(journalId);
    this.subs.add(
      this.articleService.getPublishedArticlesByIssue(journalId).subscribe({
        next: (a) => (this.articles = a),
        error: () => (this.articles = []),
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    clearTimeout(this.urlTimer);
    this.title.setTitle('IJDR - Indian Journal of Development Research');
    this.document.head.querySelector('link[rel="canonical"]')?.remove();
  }

  /** Keep `?page=N` in the address bar so the current page can be shared. */
  onPageChange(p: number) {
    clearTimeout(this.urlTimer);
    this.urlTimer = setTimeout(() => {
      if (this.route.snapshot.queryParamMap.get('page') !== String(p)) {
        void this.router.navigate([], { relativeTo: this.route, queryParams: { page: p }, queryParamsHandling: 'merge', replaceUrl: true });
      }
    }, 600);
  }

  private loadJournal(journalId: string) {
    this.subs.add(
      this.firebaseService
        .getJournalById(journalId)
        .pipe(take(1))
        .subscribe({
          next: async (journal) => {
            const jid = journal?.id;
            if (!journal || !journal.pdfUrl || !jid) {
              this.error = 'Journal or PDF not found';
              return;
            }
            this.journal = { ...journal, id: jid, edition: journal.edition || 'January-June', viewCount: journal.viewCount || 0 } as iJournal;
            this.applySeo(journal as iJournal, jid);
            this.analytics.log('journal_open', { journal_id: jid });
            if ((await this.firebaseService.isCountableViewer()) && this.firebaseService.consumeJournalViewSlot(jid)) {
              void this.firebaseService.incrementViewCount(jid).catch((err) => {
                console.error('View count increment failed:', err);
                this.firebaseService.clearJournalViewDedupe(jid);
                this.toast.show('Could not record this view.', 'warning');
              });
            }
          },
          error: () => (this.error = 'Failed to load journal details'),
        })
    );
  }

  private applySeo(journal: iJournal, jid: string) {
    const issueTitle = `${journal.title} · Vol. ${journal.volume}, No. ${journal.number} (${journal.year})`;
    this.title.setTitle(`${issueTitle} | IJDR`);
    const desc =
      journal.description?.trim() || `Read this issue of the Indian Journal of Development Research: ${issueTitle}.`;
    const canonicalUrl = `${environment.siteUrl}/journal/${jid}`;
    let link = this.document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', canonicalUrl);
    this.meta.updateTag({ name: 'description', content: desc });
    this.meta.updateTag({ property: 'og:type', content: 'article' });
    this.meta.updateTag({ property: 'og:title', content: issueTitle });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:url', content: canonicalUrl });
    this.meta.updateTag({ property: 'og:site_name', content: 'Indian Journal of Development Research' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: issueTitle });
    this.meta.updateTag({ name: 'twitter:description', content: desc });
  }

  goBack() {
    void this.router.navigate(['/journals']);
  }
}
