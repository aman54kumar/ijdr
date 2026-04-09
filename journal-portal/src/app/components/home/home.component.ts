import { Component, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { PdfModalService } from '../../services/pdf-modal.service';
import { ToastService } from '../../services/toast.service';
import { iJournal } from '../../type/journals.type';
import {
  computePopularViewCutoff,
  getJournalHighlightTags,
  type JournalHighlightTag,
} from '../../utils/journal-issue-tags.util';

@Component({
  selector: 'app-home',
  imports: [RouterLink, CommonModule, NgxSkeletonLoaderModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  latestIssues: iJournal[] = [];
  journals: iJournal[] = [];
  loadingIssues = true;
  popularViewCutoff = Number.POSITIVE_INFINITY;

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
          viewCount: journal.viewCount || 0, // Real view count from database
          createdAt: journal.createdAt,
          updatedAt: journal.updatedAt,
        }));

        this.popularViewCutoff = computePopularViewCutoff(this.journals);

        // Get latest 3 issues for display
        this.latestIssues = this.journals.slice(0, 3);
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

  issueHighlightTags(issue: iJournal): JournalHighlightTag[] {
    return getJournalHighlightTags(issue, this.popularViewCutoff);
  }
}
