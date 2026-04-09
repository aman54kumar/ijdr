import {
  Component,
  OnInit,
  OnDestroy,
  inject,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DomSanitizer, SafeResourceUrl, Title, Meta } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { ToastService } from '../../services/toast.service';
import { iJournal } from '../../type/journals.type';
import { take } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { publicPdfDisplayUrl } from '../../utils/public-pdf-url.util';

/**
 * Full-issue page at /journal/:id. Uses a native iframe with the Storage download URL so the
 * browser can stream the PDF (fast on shared links). Avoids getBlob + PDF.js which downloaded
 * the entire file before showing anything.
 */
@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pdf-viewer-container">
      <div class="pdf-header bg-white shadow-sm border-bottom">
        <div class="container">
          <div class="d-flex justify-content-between align-items-center py-3">
            <div class="pdf-info">
              <h4 class="mb-0" *ngIf="journal">{{ journal.title }}</h4>
              <small class="text-muted" *ngIf="journal">
                Volume {{ journal.volume }}, Issue {{ journal.number }} •
                {{ journal.year }}
              </small>
            </div>
            <div class="pdf-controls">
              <a
                *ngIf="iframeEmbedUrl && pdfTabUrl"
                class="btn btn-outline-primary btn-sm me-2"
                [href]="pdfTabUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                <i class="bi bi-box-arrow-up-right me-1"></i>Open in new tab
              </a>
              <button
                type="button"
                class="btn btn-outline-primary btn-sm"
                (click)="goBack()"
              >
                <i class="bi bi-arrow-left"></i> Back
              </button>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="error" class="text-center py-5">
        <div class="alert alert-danger mx-auto" style="max-width: 500px;">
          <i class="bi bi-exclamation-triangle"></i>
          {{ error }}
        </div>
        <button class="btn btn-primary" (click)="goBack()">Go Back</button>
      </div>

      <div *ngIf="!error" class="position-relative pdf-content-area">
        <div
          *ngIf="loading"
          class="text-center py-5 position-absolute top-0 start-0 w-100 pdf-loading-overlay"
        >
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading PDF...</span>
          </div>
          <p class="mt-2">Loading PDF...</p>
        </div>

        <div *ngIf="iframeEmbedUrl" class="pdf-content">
          <iframe
            class="pdf-iframe-viewer w-100 border rounded shadow-sm"
            [src]="iframeEmbedUrl"
            title="Journal PDF"
            (load)="onIframeLoaded()"
          ></iframe>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .pdf-viewer-container {
        min-height: 100vh;
        background-color: #f8f9fa;
      }

      .pdf-header {
        position: sticky;
        top: 0;
        z-index: 1000;
      }

      .pdf-content {
        padding: 20px;
        min-height: calc(100vh - 80px);
      }

      .pdf-iframe-viewer {
        min-height: calc(100vh - 140px);
        border: 1px solid #dee2e6 !important;
        background: #fff;
      }

      .pdf-content-area {
        min-height: calc(100vh - 100px);
      }

      .pdf-loading-overlay {
        z-index: 2;
        pointer-events: none;
        background: rgba(248, 249, 250, 0.85);
      }
    `,
  ],
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  journal: iJournal | null = null;
  loading = true;
  error: string | null = null;
  iframeEmbedUrl: SafeResourceUrl | null = null;
  /** Same-origin /pdf/{id} in production so downloads use a neutral filename on mobile. */
  pdfTabUrl: string | null = null;

  private document = inject(DOCUMENT);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firebaseService: FirebaseJournalService,
    private toast: ToastService,
    private title: Title,
    private meta: Meta,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    const journalId = this.route.snapshot.paramMap.get('id');
    if (journalId) {
      this.loadJournal(journalId);
    } else {
      this.error = 'No journal ID provided';
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.title.setTitle('IJDR - Indian Journal of Development Research');
    this.removeCanonicalLink();
  }

  onIframeLoaded() {
    this.loading = false;
  }

  private setCanonicalLink(href: string) {
    const head = this.document.head;
    let link = head.querySelector(
      'link[rel="canonical"]'
    ) as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private removeCanonicalLink() {
    this.document.head.querySelector('link[rel="canonical"]')?.remove();
  }

  private loadJournal(journalId: string) {
    try {
      this.loading = true;
      this.error = null;
      this.iframeEmbedUrl = null;
      this.pdfTabUrl = null;

      this.firebaseService
        .getJournalById(journalId)
        .pipe(take(1))
        .subscribe({
          next: (journal) => {
            const jid = journal?.id;
            if (journal && journal.pdfUrl && jid) {
              this.journal = {
                id: jid,
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
                viewCount: journal.viewCount || 0,
                createdAt: journal.createdAt,
                updatedAt: journal.updatedAt,
              } as iJournal;

              const issueTitle = `${journal.title} · Vol. ${journal.volume}, No. ${journal.number} (${journal.year})`;
              this.title.setTitle(`${issueTitle} | IJDR`);
              const desc =
                journal.description?.trim() ||
                `Read this issue of the Indian Journal of Development Research: ${issueTitle}.`;
              this.meta.updateTag({ name: 'description', content: desc });

              const canonicalUrl = `${environment.siteUrl}/journal/${jid}`;
              this.setCanonicalLink(canonicalUrl);

              this.meta.updateTag({ property: 'og:type', content: 'article' });
              this.meta.updateTag({ property: 'og:title', content: issueTitle });
              this.meta.updateTag({ property: 'og:description', content: desc });
              this.meta.updateTag({ property: 'og:url', content: canonicalUrl });
              this.meta.updateTag({
                property: 'og:site_name',
                content: 'Indian Journal of Development Research',
              });

              this.meta.updateTag({
                name: 'twitter:card',
                content: 'summary_large_image',
              });
              this.meta.updateTag({ name: 'twitter:title', content: issueTitle });
              this.meta.updateTag({
                name: 'twitter:description',
                content: desc,
              });

              if (this.firebaseService.consumeJournalViewSlot(jid)) {
                void this.firebaseService.incrementViewCount(jid).catch((err) => {
                  console.error('View count increment failed:', err);
                  this.firebaseService.clearJournalViewDedupe(jid);
                  this.toast.show(
                    'Could not record this view. If counts never update, deploy latest firestore.rules and check Firebase Console → App Check is not enforcing Firestore without a web provider.',
                    'warning'
                  );
                });
              }

              this.loadPDF(jid, journal.pdfUrl);
            } else {
              this.error = 'Journal or PDF not found';
              this.loading = false;
            }
          },
          error: () => {
            this.error = 'Failed to load journal details';
            this.loading = false;
          },
        });
    } catch {
      this.error = 'Failed to load journal';
      this.loading = false;
    }
  }

  private loadPDF(journalId: string, storageDownloadUrl: string) {
    try {
      const displayUrl = publicPdfDisplayUrl(journalId, storageDownloadUrl);
      this.pdfTabUrl = displayUrl;
      this.iframeEmbedUrl =
        this.sanitizer.bypassSecurityTrustResourceUrl(displayUrl);
      // Spinner hides on iframe (load); safety timeout if load never fires (some PDF plugins)
      setTimeout(() => {
        if (this.loading) {
          this.loading = false;
        }
      }, 8000);
    } catch {
      this.error = 'Failed to load PDF file. Please try again.';
      this.loading = false;
    }
  }

  goBack() {
    this.router.navigate(['/journals']);
  }
}
