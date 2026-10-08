import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { ArticleService } from '../../services/article.service';
import { AnalyticsEventsService } from '../../services/analytics-events.service';
import { PdfModalService } from '../../services/pdf-modal.service';
import { ToastService } from '../../services/toast.service';
import { iArticle, iJournal } from '../../type/journals.type';
import { PdfReaderComponent } from '../pdf-reader/pdf-reader.component';

/**
 * Issue viewer in a dialog (opened from the home page, issue list and admin).
 * It is only a frame; the reading experience is the shared PdfReaderComponent.
 */
@Component({
  selector: 'app-pdf-modal',
  standalone: true,
  imports: [CommonModule, PdfReaderComponent],
  template: `
    @if (isOpen) {
      <div class="pdf-modal-overlay" (click)="onOverlayClick($event)">
        <div class="pdf-modal-container" [class.fullscreen]="isFullscreen" role="dialog" aria-modal="true"
          [attr.aria-labelledby]="journal ? 'pdf-modal-title' : null" (keydown)="onDialogKeydown($event)" #dialog>
          <div class="pdf-modal-header">
            <div class="pdf-info">
              @if (journal) {
                <h2 class="h5 mb-0" id="pdf-modal-title">{{ journal.title }}</h2>
                <small class="text-muted">Volume {{ journal.volume }}, Issue {{ journal.number }} • {{ journal.year }}</small>
              }
            </div>
            <div class="btn-group">
              <button type="button" class="btn btn-outline-primary btn-sm" *ngIf="journal?.id" (click)="openFullPage()"
                title="Open this issue on its own page" aria-label="Open on its own page"><i class="bi bi-box-arrow-up-right"></i></button>
              <button type="button" class="btn btn-outline-secondary btn-sm" *ngIf="journal?.id" (click)="copyShareLink()"
                [title]="linkCopied ? 'Link copied' : 'Copy link to this issue'" aria-label="Copy link to this issue">
                <i class="bi" [class.bi-check2]="linkCopied" [class.bi-link-45deg]="!linkCopied"></i></button>
              <button type="button" class="btn btn-outline-secondary btn-sm" (click)="toggleFullscreen()"
                [title]="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" [attr.aria-label]="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'">
                <i class="bi" [class.bi-fullscreen-exit]="isFullscreen" [class.bi-fullscreen]="!isFullscreen"></i></button>
              <button type="button" class="btn btn-outline-danger btn-sm" id="pdf-modal-close-btn" (click)="closeModal()" title="Close" aria-label="Close">
                <i class="bi bi-x-lg"></i></button>
            </div>
          </div>
          <div class="pdf-modal-content">
            @if (journal && loaded) {
              @defer {
                <app-pdf-reader [journal]="journal" [articles]="articles" [embedded]="true"></app-pdf-reader>
              } @placeholder {
                <p class="text-center text-muted py-5" role="status">Loading viewer…</p>
              }
            } @else if (error) {
              <div class="p-4 text-center">
                <div class="alert alert-warning" role="alert"><i class="bi bi-exclamation-triangle me-2"></i>{{ error }}</div>
              </div>
            } @else {
              <p class="text-center text-muted py-5" role="status">Loading…</p>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .pdf-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 2000;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
      }
      .pdf-modal-container {
        display: flex;
        flex-direction: column;
        width: min(1200px, 100%);
        height: min(92vh, 100%);
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      }
      .pdf-modal-container.fullscreen {
        width: 100vw;
        height: 100vh;
        border-radius: 0;
      }
      .pdf-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.6rem 1rem;
        border-bottom: 1px solid var(--border);
      }
      .pdf-modal-content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      app-pdf-reader {
        flex: 1;
        min-height: 0;
      }
      @media (max-width: 640px) {
        .pdf-modal-overlay {
          padding: 0;
        }
        .pdf-modal-container {
          height: 100%;
          border-radius: 0;
        }
      }
    `,
  ],
})
export class PdfModalComponent implements OnInit, OnDestroy {
  isOpen = false;
  isFullscreen = false;
  journal: iJournal | null = null;
  articles: iArticle[] = [];
  loaded = false;
  error: string | null = null;
  linkCopied = false;

  @ViewChild('dialog') dialog?: ElementRef<HTMLElement>;
  private subs = new Subscription();
  private loadSub?: Subscription;
  private linkTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private modal: PdfModalService,
    private firebaseService: FirebaseJournalService,
    private articleService: ArticleService,
    private analytics: AnalyticsEventsService,
    private toast: ToastService,
    private router: Router
  ) {}

  ngOnInit() {
    this.subs.add(
      this.modal.isOpen$.subscribe((open) => {
        this.isOpen = open;
        if (open) {
          this.linkCopied = false;
          setTimeout(() => document.getElementById('pdf-modal-close-btn')?.focus());
        } else {
          this.loadSub?.unsubscribe();
          this.loaded = false;
          this.articles = [];
        }
      })
    );
    this.subs.add(
      this.modal.journal$.subscribe((j) => {
        this.journal = j;
        if (j) this.refresh(j.id);
      })
    );
    this.subs.add(this.modal.isFullscreen$.subscribe((f) => (this.isFullscreen = f)));
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.loadSub?.unsubscribe();
    clearTimeout(this.linkTimer);
  }

  /** Re-read the issue so a replaced PDF is picked up, count the view, and fetch its articles. */
  private refresh(id: string) {
    this.loadSub?.unsubscribe();
    this.loaded = false;
    this.error = null;
    const sub = new Subscription();
    this.loadSub = sub;
    sub.add(
      this.firebaseService.getJournalById(id).pipe(take(1)).subscribe({
        next: (j) => {
          if (!j?.id || !j.pdfUrl) {
            this.error = 'PDF not available for this journal';
            return;
          }
          this.journal = { ...(this.journal as iJournal), ...(j as iJournal), id: j.id };
          this.loaded = true;
          this.analytics.log('journal_open', { journal_id: j.id });
          if (this.firebaseService.consumeJournalViewSlot(j.id)) {
            void this.firebaseService.incrementViewCount(j.id).catch(() => {
              this.firebaseService.clearJournalViewDedupe(j.id!);
              this.toast.show('Could not record this view.', 'warning');
            });
          }
        },
        error: () => (this.error = 'Failed to load journal'),
      })
    );
    sub.add(
      this.articleService.getPublishedArticlesByIssue(id).subscribe({
        next: (a) => (this.articles = a),
        error: () => (this.articles = []),
      })
    );
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(ev: Event) {
    if (this.isOpen && !ev.defaultPrevented) {
      ev.preventDefault();
      this.closeModal();
    }
  }

  onDialogKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const container = event.currentTarget as HTMLElement;
    const sel =
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const list = Array.from(container.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  openFullPage() {
    const id = this.journal?.id;
    if (!id) return;
    this.modal.closeModal();
    void this.router.navigate(['/journal', id]);
  }

  copyShareLink() {
    const id = this.journal?.id;
    if (!id) return;
    const url = `${window.location.origin}/journal/${id}`;
    const done = () => {
      this.linkCopied = true;
      clearTimeout(this.linkTimer);
      this.linkTimer = setTimeout(() => (this.linkCopied = false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => window.prompt('Copy this link:', url));
    } else {
      window.prompt('Copy this link:', url);
    }
  }

  onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) this.closeModal();
  }

  closeModal() {
    this.modal.closeModal();
  }

  toggleFullscreen() {
    this.modal.toggleFullscreen();
  }
}
