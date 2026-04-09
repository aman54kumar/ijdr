import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { iJournal } from '../../type/journals.type';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { PdfModalService } from '../../services/pdf-modal.service';
import { ToastService } from '../../services/toast.service';
import { TruncatePipe } from '../../pipes/truncate.pipe';
import {
  CardComponent,
  CardAction,
  CardMeta,
} from '../common/card/card.component';
import {
  computePopularViewCutoff,
  getJournalHighlightTags,
  type JournalHighlightTag,
} from '../../utils/journal-issue-tags.util';

@Component({
  selector: 'app-journals',
  standalone: true,
  templateUrl: './journals.component.html',
  imports: [
    CommonModule,
    FormsModule,
    TruncatePipe,
    CardComponent,
    NgxSkeletonLoaderModule,
  ],
  styleUrls: ['./journals.component.scss'],
})
export class JournalsComponent implements OnInit {
  journals: iJournal[] = [];
  filteredJournalsList: iJournal[] = [];
  groupedJournals: { [year: string]: iJournal[] } = {};
  yearKeys: string[] = [];
  searchText: string = '';
  loading: boolean = true;
  sortMode: 'newest' | 'views' = 'newest';
  filterYear: string = '';
  yearFilterOptions: string[] = [];
  /** Cutoff from full catalog; +Infinity means no issue counts as Popular. */
  popularViewCutoff = Number.POSITIVE_INFINITY;

  constructor(
    private firebaseService: FirebaseJournalService,
    private router: Router,
    private pdfModalService: PdfModalService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    // Scroll to top of page when component loads
    this.scrollToTop();

    this.firebaseService.getJournals().subscribe({
      next: (journals: any[]) => {
        this.journals = journals.map((journal) => ({
          id: journal.id,
          title: journal.title,
          edition: journal.edition || 'January-June', // Default for existing journals
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

        // Group journals by year
        this.groupedJournals = this.journals.reduce((acc, journal) => {
          const year = String(journal.year);
          if (!acc[year]) acc[year] = [];
          acc[year].push(journal);
          return acc;
        }, {} as { [year: string]: iJournal[] });

        // Sort years in descending order
        this.yearKeys = Object.keys(this.groupedJournals).sort(
          (a, b) => parseInt(b) - parseInt(a)
        );

        this.yearFilterOptions = [
          ...new Set(this.journals.map((j) => String(j.year))),
        ].sort((a, b) => parseInt(b) - parseInt(a));
        this.popularViewCutoff = computePopularViewCutoff(this.journals);
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading journals:', error);
        this.loading = false;
      },
    });
  }

  // Group journals by year for organized display
  groupJournalsByYear() {
    this.groupedJournals = {};
    this.filteredJournalsList.forEach((journal) => {
      const year = String(journal.year);
      if (!this.groupedJournals[year]) {
        this.groupedJournals[year] = [];
      }
      this.groupedJournals[year].push(journal);
    });

    // Sort years in descending order (newest first)
    this.yearKeys = Object.keys(this.groupedJournals).sort(
      (a, b) => parseInt(b) - parseInt(a)
    );
  }

  searchJournals() {
    this.applyFilters();
  }

  clearSearch() {
    this.searchText = '';
    this.filterYear = '';
    this.sortMode = 'newest';
    this.applyFilters();
  }

  onSortOrYearChange() {
    this.applyFilters();
  }

  private applyFilters() {
    let list = [...this.journals];
    if (this.filterYear) {
      list = list.filter((j) => String(j.year) === this.filterYear);
    }
    if (this.searchText.trim()) {
      const searchTerm = this.searchText.toLowerCase();
      list = list.filter((journal) => {
        const haystack = [
          journal.title,
          journal.volume,
          journal.number,
          journal.year,
          journal.edition,
          journal.description,
          journal.ssn,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(searchTerm);
      });
    }
    if (this.sortMode === 'views') {
      list.sort((a, b) => {
        const vc = (b.viewCount || 0) - (a.viewCount || 0);
        if (vc !== 0) return vc;
        if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year);
        if (a.volume !== b.volume) return b.volume - a.volume;
        return b.number - a.number;
      });
    } else {
      list.sort((a, b) => {
        if (a.year !== b.year) return parseInt(b.year) - parseInt(a.year);
        if (a.volume !== b.volume) return b.volume - a.volume;
        return b.number - a.number;
      });
    }
    this.filteredJournalsList = list;
    this.groupJournalsByYear();
  }

  trackByJournal(index: number, journal: iJournal): any {
    return journal.id || index;
  }

  // Returns essential journal metadata (volume and issue number only - year is in title)
  getJournalMeta(journal: iJournal): CardMeta[] {
    return [
      { icon: 'bi bi-layers', text: `Volume ${journal.volume}` },
      { icon: 'bi bi-hash', text: `No. ${journal.number}` },
      // Removed year since it's already in the title
    ];
  }

  journalHighlightTags(journal: iJournal): JournalHighlightTag[] {
    return getJournalHighlightTags(journal, this.popularViewCutoff);
  }

  getJournalActions(journal: iJournal): CardAction[] {
    return [
      {
        label: 'Read Journal',
        icon: 'bi bi-book-open',
        action: () => this.openJournalPDF(journal),
        class: 'btn-primary btn-full',
      },
      {
        label: 'Copy link',
        icon: 'bi bi-link-45deg',
        action: () => this.copyJournalShareLink(journal),
        class: 'btn-outline-secondary btn-full',
      },
    ];
  }

  copyJournalShareLink(journal: iJournal) {
    if (!journal.id) {
      return;
    }
    const url = `${window.location.origin}/journal/${journal.id}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {
        window.prompt('Copy this link:', url);
      });
    } else {
      window.prompt('Copy this link:', url);
    }
  }

  openJournalPDF(journal: iJournal) {
    if (journal.id) {
      this.pdfModalService.openModal(journal);
    } else {
      this.toast.show('Journal not available.', 'warning');
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Scroll to top of the page
  private scrollToTop() {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'smooth',
    });
  }
}
