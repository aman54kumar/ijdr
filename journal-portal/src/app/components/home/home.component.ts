import { Component, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { IssueCardComponent } from '../common/issue-card/issue-card.component';
import { IssueCoverComponent } from '../common/issue-cover/issue-cover.component';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { PdfModalService } from '../../services/pdf-modal.service';
import { ToastService } from '../../services/toast.service';
import { iJournal } from '../../type/journals.type';
import {
  computePopularViewCutoff,
  getJournalHighlightTags,
  type JournalHighlightTag,
} from '../../utils/journal-issue-tags.util';
import {
  describeDaysLeft,
  getNextSubmissionDeadline,
  type SubmissionDeadline,
} from '../../utils/submission-deadline.util';

@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    CommonModule,
    NgxSkeletonLoaderModule,
    IssueCardComponent,
    IssueCoverComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  latestIssues: iJournal[] = [];
  journals: iJournal[] = [];
  mostRead: iJournal[] = [];
  stats = { issues: 0, firstYear: '', lastYear: '', views: 0 };
  loadingIssues = true;
  popularViewCutoff = Number.POSITIVE_INFINITY;
  // Computed once per page load; rolls over automatically after 30 June / 31 December
  deadline: SubmissionDeadline = getNextSubmissionDeadline();
  deadlineCountdown = describeDaysLeft(this.deadline.daysLeft);

  constructor(
    private firebaseService: FirebaseJournalService,
    private router: Router,
    private pdfModalService: PdfModalService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    // Scroll to top of page when component loads
    this.scrollToTop();

    this.firebaseService.getJournals().subscribe({
      next: (journals: any[]) => {
        this.loadingIssues = false;
        // Sort by year (desc), then volume (desc), then issue number (desc) to get latest issues
        const sortedJournals = journals.sort((a, b) => {
          if (a.year !== b.year) {
            return parseInt(b.year) - parseInt(a.year);
          }
          if (a.volume !== b.volume) {
            return b.volume - a.volume;
          }
          return b.number - a.number;
        });

        // Store all journals for stats
        this.journals = sortedJournals.map((journal) => ({
          id: journal.id,
          title: journal.title,
          edition: journal.edition || 'January-June',
          volume: journal.volume,
          number: journal.number,
          year: journal.year,
          description: journal.description,
          ssn: journal.ssn,
          pdfUrl: journal.pdfUrl,
          pdfFileName: journal.pdfFileName,
          fileSize: journal.fileSize,
          coverUrl: journal.coverUrl,
          viewCount: journal.viewCount || 0, // Real view count from database
          createdAt: journal.createdAt,
          updatedAt: journal.updatedAt,
        }));

        this.popularViewCutoff = computePopularViewCutoff(this.journals);

        // Get latest 3 issues for display
        this.latestIssues = this.journals.slice(0, 3);

        // Stats strip and "Most read" come from the same data (no hard-coded numbers)
        const years = this.journals.map((j) => parseInt(j.year)).filter((y) => !isNaN(y));
        this.stats = {
          issues: this.journals.length,
          firstYear: years.length ? String(Math.min(...years)) : '',
          lastYear: years.length ? String(Math.max(...years)) : '',
          views: this.journals.reduce((n, j) => n + (j.viewCount || 0), 0),
        };
        this.mostRead = [...this.journals]
          .filter((j) => (j.viewCount || 0) > 0)
          .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0))
          .slice(0, 4);
      },
      error: (error) => {
        this.loadingIssues = false;
        console.error('Error loading journals:', error);
      },
    });
  }

  // Scroll to top of the page
  private scrollToTop() {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  }

  openJournalPDF(journal: iJournal) {
    if (journal.id) {
      this.pdfModalService.openModal(journal);
    } else {
      this.toast.show('Journal not available.', 'warning');
    }
  }

  copyIssueLink(journal: iJournal) {
    if (!journal.id) {
      return;
    }
    const url = `${window.location.origin}/journal/${journal.id}`;
    navigator.clipboard?.writeText(url).then(
      () => this.toast.show('Link copied.', 'success'),
      () => window.prompt('Copy this link:', url)
    );
  }

  shareCallForPapers() {
    const data = {
      title: 'Call for papers: Indian Journal of Development Research',
      text: 'IJDR is accepting submissions: double-blind peer review, open access.',
      url: `${window.location.origin}/contribute`,
    };
    if (navigator.share) {
      // AbortError just means the user closed the share sheet
      navigator.share(data).catch(() => undefined);
      return;
    }
    navigator.clipboard?.writeText(data.url).then(
      () => this.toast.show('Link copied. Pass it on to a colleague.', 'success'),
      () => window.prompt('Copy this link:', data.url)
    );
  }

  issueHighlightTags(issue: iJournal): JournalHighlightTag[] {
    return getJournalHighlightTags(issue, this.popularViewCutoff);
  }
}
