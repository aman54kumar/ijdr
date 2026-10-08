import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { FirebaseJournalService, FirebaseJournal } from '../../../services/firebase-journal.service';
import { StatsService, TrendPoint, dailyViewTrend, topGained } from '../../../services/stats.service';
import { AuditService } from '../../../services/audit.service';
import { ToastService } from '../../../services/toast.service';
import { AuditEntry, DailyStats } from '../../../type/journals.type';
import { SparklineComponent } from '../sparkline.component';

@Component({
  selector: 'app-admin-insights',
  standalone: true,
  imports: [CommonModule, RouterLink, SparklineComponent],
  templateUrl: './admin-insights.component.html',
  styleUrl: './admin-insights.component.scss',
})
export class AdminInsightsComponent implements OnInit, OnDestroy {
  private firebaseService = inject(FirebaseJournalService);
  private stats = inject(StatsService);
  private auditService = inject(AuditService);
  private toast = inject(ToastService);
  private subs = new Subscription();

  journals: FirebaseJournal[] = [];
  loading = true;

  days: DailyStats[] = [];
  statsLoaded = false;
  issueTrend: TrendPoint[] = [];
  articleTrend: TrendPoint[] = [];
  topIssues: { id: string; title: string; views: number }[] = [];
  topArticles: { id: string; title: string; views: number }[] = [];
  latest?: DailyStats;
  snapshotting = false;
  audit: AuditEntry[] = [];

  ngOnInit() {
    this.subs.add(
      this.firebaseService.getJournals().subscribe({
        next: (list) => {
          this.journals = [...list].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
          this.loading = false;
        },
        error: () => (this.loading = false),
      })
    );
    this.subs.add(
      this.stats.recent(30).subscribe({
        next: (d) => this.applyDays(d),
        error: () => (this.statsLoaded = true),
      })
    );
    this.subs.add(this.auditService.recent(50).subscribe({ next: (a) => (this.audit = a), error: () => (this.audit = []) }));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private applyDays(d: DailyStats[]) {
    this.days = [...d].sort((a, b) => a.date.localeCompare(b.date));
    this.latest = this.days[this.days.length - 1];
    this.issueTrend = dailyViewTrend(this.days, (x) => x.totals.issueViews);
    this.articleTrend = dailyViewTrend(this.days, (x) => x.totals.articleViews);
    this.topIssues = topGained(this.days, 'issues');
    this.topArticles = topGained(this.days, 'articles');
    this.statsLoaded = true;
  }

  values(t: TrendPoint[]): number[] {
    return t.map((p) => p.value);
  }

  sum(t: TrendPoint[]): number {
    return t.reduce((a, p) => a + p.value, 0);
  }

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
}
