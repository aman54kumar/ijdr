import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { JournalService } from '../../services/journal.service';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { TruncatePipe } from '../../pipes/truncate.pipe';

@Component({
  standalone: true,
  selector: 'app-journal-detail',
  imports: [CommonModule, NgxSkeletonLoaderModule, TruncatePipe],
  templateUrl: './journal-detail.component.html',
})
export class JournalDetailComponent implements OnInit {
  journal: any = null;
  journalId: number = 0;
  selectedArticle: any = null;
  articles: any[] = [];
  journals: any[] = [];
  loading: boolean = false;
  notFound: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private journalService: JournalService,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.loading = true;

    this.route.params.subscribe((params) => {
      this.journalId = +params['id'];

      this.journalService.getJournalById(this.journalId).subscribe({
        next: (journal) => {
          if (journal) {
            this.journal = journal;
            this.articles = journal.articles || [];
            this.notFound = false;
          } else {
            this.notFound = true;
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading journal:', err);
          this.notFound = true;
          this.loading = false;
        },
      });
    });
  }

  openPdfModal(article: any) {
    // this.selectedArticle = article;
    this.selectedArticle = {
      ...article,
      pdf_url: this.sanitizer.bypassSecurityTrustResourceUrl(article.pdfUrl),
    };

    const modalElement = document.getElementById('pdfModal');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  getTagList(article: any): string {
    if (!article.tags || article.tags.length === 0) {
      return '';
    }
    return article.tags.map((t: any) => t.name).join(', ');
  }
}
