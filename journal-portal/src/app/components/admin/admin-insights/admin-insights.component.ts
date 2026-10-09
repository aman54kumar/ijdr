import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ObservableInput, Subscription, combineLatest, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FirebaseJournalService, FirebaseJournal } from '../../../services/firebase-journal.service';
import { StatsService } from '../../../services/stats.service';
import { ArticleService } from '../../../services/article.service';
import { SubmissionService } from '../../../services/submission.service';
import { ContactService, ContactSubmission } from '../../../services/contact.service';
import { AuditService } from '../../../services/audit.service';
import { ToastService } from '../../../services/toast.service';
import { AuditEntry, DailyStats, Submission, iArticle } from '../../../type/journals.type';
import {
  AiUsageRow,
  CatalogueStats,
  Fact,
  Health,
  IssueRow,
  MessageStats,
  Mover,
  SubmissionStats,
  TrafficStats,
  activityStats,
  aiUsage,
  catalogueStats,
  contentHealth,
  fmtDate,
  funFacts,
  issueRows,
  messageStats,
  movers,
  submissionStats,
  trafficStats,
} from './insights';
import { AreaChartComponent, AreaSeries, ColumnsComponent, DonutComponent, HBarsComponent, ScoreRingComponent, SERIES } from './charts.component';
import { SparklineComponent } from '../sparkline.component';
import { SUBMISSION_STATUS_LABELS } from '../../../type/journals.type';

/** Days in the window; 0 = all recorded history. */
type Range = 7 | 30 | 90 | 365 | 0;
type Tab = 'overview' | 'readers' | 'content' | 'health' | 'inbox' | 'system';

interface Attention {
  icon: string;
  text: string;
  level: 'warn' | 'info' | 'bad';
  tab: Tab;
}

@Component({
  selector: 'app-admin-insights',
  standalone: true,
  imports: [CommonModule, RouterLink, AreaChartComponent, ColumnsComponent, DonutComponent, HBarsComponent, ScoreRingComponent, SparklineComponent],
  templateUrl: './admin-insights.component.html',
  styleUrl: './admin-insights.component.scss',
})
export class AdminInsightsComponent implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseJournalService);
  private stats = inject(StatsService);
  private articleService = inject(ArticleService);
  private submissionService = inject(SubmissionService);
  private contactService = inject(ContactService);
  private auditService = inject(AuditService);
  private toast = inject(ToastService);
  private subs = new Subscription();

  readonly ranges: { value: Range; label: string }[] = [
    { value: 7, label: '7D' },
    { value: 30, label: '30D' },
    { value: 90, label: '90D' },
    { value: 365, label: '1Y' },
    { value: 0, label: 'All' },
  ];
  readonly series = SERIES;
  readonly fmt = fmtDate;
  readonly statusLabels = SUBMISSION_STATUS_LABELS;

  range: Range = 30;
  tab: Tab = 'overview';
  /** How many daily snapshots are currently loaded from Firestore. */
  private loadedDays = 0;
  private statsSub?: Subscription;
  loading = true;
  statsLoaded = false;
  snapshotting = false;
  auditShown = 8;
  factsShown = 8;

  journals: FirebaseJournal[] = [];
  articles: iArticle[] = [];
  submissions: Submission[] = [];
  messages: ContactSubmission[] = [];
  audit: AuditEntry[] = [];
  days: DailyStats[] = [];

  // derived
  traffic?: TrafficStats;
  trafficSeries: AreaSeries[] = [];
  risingIssues: Mover[] = [];
  risingArticles: Mover[] = [];
  coolingArticles: Mover[] = [];
  catalogue?: CatalogueStats;
  health?: Health;
  issues: IssueRow[] = [];
  subStats?: SubmissionStats;
  msgStats?: MessageStats;
  ai?: { rows: AiUsageRow[]; total: number; dates: string[] };
  activity?: ReturnType<typeof activityStats>;
  facts: Fact[] = [];

  ngOnInit() {
    // Each source is independent: one failing (e.g. a rules gap) must not blank the whole page.
    const safe = <T>(v: T) => catchError<T, ObservableInput<T>>(() => of(v));
    this.subs.add(
      combineLatest([
        this.firebaseService.getJournals().pipe(safe([] as FirebaseJournal[])),
        this.articleService.getAllForAdmin().pipe(safe([] as iArticle[])),
        this.submissionService.list().pipe(safe([] as Submission[])),
        this.contactService.getSubmissions().pipe(safe([] as ContactSubmission[])),
      ]).subscribe(([j, a, s, m]) => {
        this.journals = j;
        this.articles = a;
        this.submissions = s;
        this.messages = m;
        this.loading = false;
        this.compute();
      })
    );
    this.loadStats(90);
    this.subs.add(
      this.auditService.recent(200).subscribe({
        next: (a) => {
          this.audit = a;
          this.activity = activityStats(a);
        },
        error: () => (this.audit = []),
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  /** Windows longer than what is loaded fetch more history; the default keeps reads small. */
  private loadStats(count: number) {
    if (count <= this.loadedDays) return;
    this.loadedDays = count;
    this.statsSub?.unsubscribe();
    this.statsSub = this.stats.recent(count).subscribe({
      next: (d) => {
        this.days = [...d].sort((a, b) => a.date.localeCompare(b.date));
        this.statsLoaded = true;
        this.compute();
      },
      error: () => (this.statsLoaded = true),
    });
  }

  setRange(r: Range) {
    this.range = r;
    this.loadStats(r === 0 ? 3650 : r > 90 ? r + 1 : 90);
    this.compute();
  }

  get windowDays(): number {
    return this.range === 0 ? 100000 : this.range;
  }

  get rangeText(): string {
    return this.range === 0 ? 'all time' : this.range === 365 ? 'last year' : `last ${this.range} days`;
  }

  get tabs(): { id: Tab; label: string; icon: string; badge?: number }[] {
    return [
      { id: 'overview', label: 'Overview', icon: 'bi-grid-1x2' },
      { id: 'readers', label: 'Readers', icon: 'bi-people' },
      { id: 'content', label: 'Content', icon: 'bi-journal-richtext' },
      { id: 'health', label: 'Health', icon: 'bi-heart-pulse', badge: this.attention.filter((a) => a.tab === 'health').length || undefined },
      { id: 'inbox', label: 'Inbox', icon: 'bi-inbox', badge: (this.subStats?.open ?? 0) + (this.msgStats?.fresh ?? 0) || undefined },
      { id: 'system', label: 'AI & activity', icon: 'bi-cpu' },
    ];
  }

  /** Things an admin can act on right now. */
  get attention(): Attention[] {
    const a: Attention[] = [];
    const sub = this.subStats;
    const msg = this.msgStats;
    const cat = this.catalogue;
    const h = this.health;
    if (sub?.waitingOver14) a.push({ icon: 'bi-hourglass-split', level: 'bad', tab: 'inbox', text: `${sub.waitingOver14} manuscript${sub.waitingOver14 === 1 ? '' : 's'} waiting over 14 days` });
    if (msg?.highPriorityOpen) a.push({ icon: 'bi-exclamation-triangle', level: 'bad', tab: 'inbox', text: `${msg.highPriorityOpen} high-priority message${msg.highPriorityOpen === 1 ? '' : 's'} unanswered` });
    if (msg?.fresh) a.push({ icon: 'bi-envelope', level: 'warn', tab: 'inbox', text: `${msg.fresh} new message${msg.fresh === 1 ? '' : 's'}` });
    if (cat?.drafts) a.push({ icon: 'bi-file-earmark', level: 'info', tab: 'health', text: `${cat.drafts} draft article${cat.drafts === 1 ? '' : 's'} not yet published` });
    if (cat?.ai.needsReview) a.push({ icon: 'bi-robot', level: 'warn', tab: 'health', text: `${cat.ai.needsReview} low-confidence AI draft${cat.ai.needsReview === 1 ? '' : 's'} to review` });
    if (h?.issuesWithoutCover) a.push({ icon: 'bi-image', level: 'info', tab: 'health', text: `${h.issuesWithoutCover} issue${h.issuesWithoutCover === 1 ? '' : 's'} without a cover` });
    const weak = h?.checks.filter((c) => c.weight >= 2 && c.total && c.ok / c.total < 0.6) ?? [];
    for (const c of weak.slice(0, 2)) a.push({ icon: 'bi-clipboard-data', level: 'warn', tab: 'health', text: `${c.total - c.ok} article${c.total - c.ok === 1 ? '' : 's'} missing ${c.label.toLowerCase()}` });
    if (cat?.neverOpened.length) a.push({ icon: 'bi-eye-slash', level: 'info', tab: 'content', text: `${cat.neverOpened.length} published article${cat.neverOpened.length === 1 ? ' has' : 's have'} never been opened` });
    return a;
  }

  private compute() {
    this.catalogue = catalogueStats(this.articles, this.journals);
    this.health = contentHealth(this.articles, this.journals);
    this.issues = issueRows(this.journals);
    this.subStats = submissionStats(this.submissions);
    this.msgStats = messageStats(this.messages);

    const window = this.days.slice(-(this.windowDays + 1));
    this.traffic = trafficStats(this.days, this.windowDays);
    this.trafficSeries = [
      { name: 'Article views', values: this.traffic.articles, color: SERIES[0] },
      { name: 'Issue views', values: this.traffic.issues, color: SERIES[1] },
    ];
    this.risingIssues = movers(window, 'issues').rising;
    const a = movers(window, 'articles');
    this.risingArticles = a.rising;
    this.coolingArticles = a.cooling;
    this.ai = aiUsage(this.days, this.windowDays);
    this.facts = funFacts(this.catalogue, this.traffic, this.subStats);
  }

  get hasTrend(): boolean {
    return !!this.traffic && this.traffic.dates.length > 0;
  }

  get allTimeViews(): number {
    return this.journals.reduce((a, j) => a + (j.viewCount ?? 0), 0) + (this.catalogue?.totalViews ?? 0);
  }

  get articleViewsTotal(): number {
    return this.traffic?.articles.reduce((a, b) => a + b, 0) ?? 0;
  }

  get issueViewsTotal(): number {
    return this.traffic?.issues.reduce((a, b) => a + b, 0) ?? 0;
  }

  get unhandledMessages(): number {
    return this.msgStats?.fresh ?? 0;
  }

  /** Bars for the "most read" lists. */
  get mostRead() {
    return (this.catalogue?.mostRead ?? []).map((a) => ({
      label: a.title,
      value: a.viewCount ?? 0,
      sub: [a.issueYear, a.subject].filter(Boolean).join(' · '),
      link: ['/article', a.id],
    }));
  }

  moverBars(m: Mover[], kind: 'article' | 'journal') {
    return m.map((x) => ({ label: x.title, value: Math.abs(x.delta), sub: `${x.views} views in period · ${x.delta > 0 ? '+' : '−'}${Math.abs(x.delta)} vs first half`, link: ['/' + kind, x.id] }));
  }

  get topSubjects() {
    return (this.catalogue?.subjects ?? []).slice(0, 8);
  }

  get pendingAiReview(): number {
    return this.catalogue?.ai.needsReview ?? 0;
  }

  get submissionDonut() {
    const color: Record<string, string> = {
      received: 'var(--secondary-400)',
      under_review: 'var(--link)',
      revision: 'var(--warning-600)',
      accepted: 'var(--success-600)',
      rejected: 'var(--error-600)',
    };
    return (this.subStats?.byStatus ?? []).map((b) => ({ label: this.statusLabels[b.status], value: b.value, color: color[b.status] }));
  }

  get neverOpenedList() {
    return (this.catalogue?.neverOpened ?? []).slice(0, 6);
  }

  trackId = (_: number, x: { id?: string }) => x.id;

  async snapshot() {
    this.snapshotting = true;
    try {
      await this.stats.snapshotNow();
      this.toast.show('Snapshot saved. Trends need at least two days of snapshots.', 'success');
    } catch {
      this.toast.show('Could not take a snapshot.', 'danger');
    } finally {
      this.snapshotting = false;
    }
  }

  showMoreAudit() {
    this.auditShown += 20;
  }

  actionLabel(a: AuditEntry): string {
    const labels: Record<string, string> = {
      'article.publish': 'Published article',
      'article.unpublish': 'Unpublished article',
      'article.delete': 'Deleted article',
      'issue.delete': 'Deleted issue',
      'submission.status': 'Changed submission status',
    };
    return labels[a.action] ?? a.action;
  }

  actionBars() {
    return (this.activity?.actions ?? []).map((b) => ({ ...b, label: this.actionLabel({ action: b.label } as AuditEntry) }));
  }

  changeClass(c: number | null): string {
    return c === null ? 'flat' : c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
  }
}
