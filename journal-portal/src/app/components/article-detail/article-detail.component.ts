import { Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, switchMap, of, map, forkJoin, take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { ArticleService } from '../../services/article.service';
import { ArticleSeoService } from '../../services/article-seo.service';
import { ToastService } from '../../services/toast.service';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { AnalyticsEventsService } from '../../services/analytics-events.service';
import { AiService, AI_OFF, aiErrorMessage } from '../../services/ai.service';
import { AiSettings, AiSummary, AiTranslation, iArticle } from '../../type/journals.type';
import {
  articleUrl,
  CITATION_FORMATS,
  CitationFormat,
  formatCitation,
} from '../../utils/citation.util';

@Component({
  selector: 'app-article-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './article-detail.component.html',
  styleUrl: './article-detail.component.scss',
})
export class ArticleDetailComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private articles = inject(ArticleService);
  private seo = inject(ArticleSeoService);
  private toast = inject(ToastService);
  private ai = inject(AiService);
  private analytics = inject(AnalyticsEventsService);
  private journals = inject(FirebaseJournalService);
  private sub: Subscription;
  private settingsSub?: Subscription;

  article?: iArticle;
  related: iArticle[] = [];
  loading = true;
  notFound = false;

  readonly formats = CITATION_FORMATS;
  citeOpen = false;
  citeFormat: CitationFormat = 'apa';
  // AI (Phase 5)
  aiSettings: AiSettings = AI_OFF;
  summary?: AiSummary;
  summaryBusy = false;
  summaryError = '';
  lang: 'en' | 'hi' = 'en';
  translation?: AiTranslation;
  translating = false;
  translateError = '';
  chatOpen = false;
  question = '';
  asking = false;
  chat: { q: string; answer?: string; pages?: number[]; answerable?: boolean; error?: string }[] = [];

  readonly canShare = typeof navigator !== 'undefined' && !!navigator.share;

  constructor() {
    this.settingsSub = this.ai.settings$().subscribe((s) => (this.aiSettings = s));
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
    this.settingsSub?.unsubscribe();
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
      this.resetAi();
      void this.loadRelated(a);
      void this.loadCachedAi(a);
      this.countView(a.id);
      this.analytics.log('article_view', { article_id: a.id });
    }
  }

  private resetAi() {
    this.summary = undefined;
    this.summaryError = '';
    this.lang = 'en';
    this.translation = undefined;
    this.translateError = '';
    this.chatOpen = false;
    this.chat = [];
    this.question = '';
  }

  /** AI "related" list when an admin has generated it; otherwise the keyword-based list. */
  private async loadRelated(a: iArticle) {
    const ids = await this.ai.relatedIds(a.id);
    if (ids.length) {
      forkJoin(ids.map((id) => this.articles.getArticle(id).pipe(take(1)))).subscribe({
        next: (list) => {
          const ok = list.filter((x): x is iArticle => !!x && x.status === 'published');
          if (ok.length) this.related = ok;
          else this.keywordRelated(a);
        },
        error: () => this.keywordRelated(a),
      });
    } else {
      this.keywordRelated(a);
    }
  }

  private keywordRelated(a: iArticle) {
    this.articles.getRelated(a).subscribe({ next: (r) => (this.related = r), error: () => (this.related = []) });
  }

  /** Reads cached AI content straight from Firestore: viewing it never calls Gemini. */
  private async loadCachedAi(a: iArticle) {
    const s = await this.ai.cachedSummary(a.id);
    if (this.article?.id === a.id) {
      this.summary = s;
      if (s && this.showSummary) this.analytics.log('ai_summary_view', { article_id: a.id });
    }
  }

  /** Summary box is shown only while the feature is on and the summary is not hidden by an admin. */
  get showSummary(): boolean {
    return this.aiSettings.summaries && !!this.summary && !this.summary.hidden;
  }

  get canGenerateSummary(): boolean {
    return this.aiSettings.summaries && this.ai.appCheckReady && !this.summary;
  }

  get canTranslate(): boolean {
    return this.aiSettings.translation && this.ai.appCheckReady;
  }

  get canChat(): boolean {
    return this.aiSettings.chat && this.ai.appCheckReady && !!this.article?.pageStart;
  }

  async generateSummary() {
    if (!this.article || this.summaryBusy) return;
    this.summaryBusy = true;
    this.summaryError = '';
    try {
      this.summary = await this.ai.summarize(this.article.id);
      this.analytics.log('ai_summary_view', { article_id: this.article.id });
    } catch (e) {
      this.summaryError = aiErrorMessage(e);
    } finally {
      this.summaryBusy = false;
    }
  }

  async setLang(lang: 'en' | 'hi') {
    this.lang = lang;
    this.translateError = '';
    if (lang === 'en' || this.translation || !this.article) return;
    this.translating = true;
    try {
      this.translation =
        (await this.ai.cachedTranslation(this.article.id)) ?? (await this.ai.translate(this.article.id));
    } catch (e) {
      this.translateError = aiErrorMessage(e);
      this.lang = 'en';
    } finally {
      this.translating = false;
    }
  }

  /** What to display for each field in the chosen language (falls back to English). */
  get hi(): boolean {
    return this.lang === 'hi' && !!this.translation;
  }

  get shownTitle(): string {
    return (this.hi && this.translation?.title) || this.article?.title || '';
  }

  get shownAbstract(): string | undefined {
    return (this.hi && this.translation?.abstract) || this.article?.abstract;
  }

  get shownSummary(): string {
    return (this.hi && this.translation?.summary) || this.summary?.text || '';
  }

  get shownKeyPoints(): string[] {
    return this.hi && this.translation?.keyPoints?.length ? this.translation.keyPoints : (this.summary?.keyPoints ?? []);
  }

  async ask() {
    const q = this.question.trim();
    if (!this.article || q.length < 3 || this.asking) return;
    const entry: (typeof this.chat)[number] = { q };
    this.chat = [...this.chat, entry];
    this.question = '';
    this.asking = true;
    try {
      const r = await this.ai.ask(this.article.id, q);
      entry.answer = r.answer;
      entry.pages = r.pages;
      entry.answerable = r.answerable;
    } catch (e) {
      entry.error = aiErrorMessage(e);
    } finally {
      this.asking = false;
      this.chat = [...this.chat];
    }
  }

  private async countView(id: string) {
    if (!(await this.journals.isCountableViewer())) return;
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
      this.analytics.log('cite_copy', { format: this.citeFormat });
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
