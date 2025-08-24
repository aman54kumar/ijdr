import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { iJournal } from '../../type/journals.type';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { PdfModalService } from '../../services/pdf-modal.service';
import { TruncatePipe } from '../../pipes/truncate.pipe';
import {
  CardComponent,
  CardAction,
  CardMeta,
  CardStat,
} from '../common/card/card.component';

@Component({
  selector: 'app-journals',
  standalone: true,
  templateUrl: './journals.component.html',
  imports: [CommonModule, FormsModule, TruncatePipe, CardComponent],
  styleUrls: ['./journals.component.scss'],
})
export class JournalsComponent implements OnInit {
  journals: iJournal[] = [];
  filteredJournalsList: iJournal[] = [];
  groupedJournals: { [year: string]: iJournal[] } = {};
  yearKeys: string[] = [];
  searchText: string = '';
  loading: boolean = true;

  constructor(
    private firebaseService: FirebaseJournalService,
    private router: Router,
    private pdfModalService: PdfModalService
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
          const year = journal.year.toString();
          if (!acc[year]) acc[year] = [];
          acc[year].push(journal);
          return acc;
        }, {} as { [year: string]: iJournal[] });

        // Sort years in descending order
        this.yearKeys = Object.keys(this.groupedJournals).sort(
          (a, b) => parseInt(b) - parseInt(a)
        );

        // Initialize filtered list
        this.filteredJournalsList = [...this.journals];
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
      const year = journal.year;
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
    if (!this.searchText.trim()) {
      this.filteredJournalsList = [...this.journals];
    } else {
      const searchTerm = this.searchText.toLowerCase();
      this.filteredJournalsList = this.journals.filter((journal) =>
        `${journal.title} ${journal.volume} ${journal.number} ${journal.year}`
          .toLowerCase()
          .includes(searchTerm)
      );
    }
  }

  clearSearch() {
    this.searchText = '';
    this.filteredJournalsList = [...this.journals];
    this.groupJournalsByYear();
  }

  trackByJournal(index: number, journal: iJournal): any {
    return journal.id || index;
  }

  // Removed getRandomViews() method - was generating fake view counts

  // Returns essential journal metadata (volume and issue number only - year is in title)
  getJournalMeta(journal: iJournal): CardMeta[] {
    return [
      { icon: 'bi bi-layers', text: `Volume ${journal.volume}` },
      { icon: 'bi bi-hash', text: `No. ${journal.number}` },
      // Removed year since it's already in the title
    ];
  }

  // Returns real journal statistics with actual view counts
  getJournalStats(journal: iJournal): CardStat[] {
    return [
      // Display real view count from database
      {
        icon: 'bi bi-eye',
        label: 'Views',
        value: (journal.viewCount || 0).toLocaleString(),
      },
    ];
  }

  getJournalActions(journal: iJournal): CardAction[] {
    return [
      {
        label: 'Read Journal',
        icon: 'bi bi-book-open',
        action: () => this.openJournalPDF(journal),
        class: 'btn-primary btn-full',
      },
    ];
  }

  openJournalPDF(journal: iJournal) {
    if (journal.id) {
      // Increment view count before opening PDF
      this.firebaseService.incrementViewCount(journal.id);
      this.pdfModalService.openModal(journal);
    } else {
      alert('Journal not available.');
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // This can be removed if you switch to using filteredJournalsList in template
  filteredJournals() {
    if (!this.searchText) return this.journals;
    const text = this.searchText.toLowerCase();
    return this.journals.filter((journal) =>
      `${journal.title} vol ${journal.volume} no ${journal.number}`
        .toLowerCase()
        .includes(text)
    );
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
