import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Storage, ref, getBlob } from '@angular/fire/storage';
import { PdfModalService } from '../../services/pdf-modal.service';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { ToastService } from '../../services/toast.service';
import { publicPdfDisplayUrl } from '../../utils/public-pdf-url.util';
import { iJournal } from '../../type/journals.type';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

const PDFJS_VERSION = '3.4.120';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

@Component({
  selector: 'app-pdf-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="isOpen"
      class="pdf-modal-overlay"
      (click)="onOverlayClick($event)"
    >
      <div
        class="pdf-modal-container"
        [class.fullscreen]="isFullscreen"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="journal ? 'pdf-modal-title' : null"
        (keydown)="onDialogKeydown($event)"
      >
        <!-- Modal Header -->
        <div class="pdf-modal-header">
          <div class="pdf-info">
            <h4 class="mb-0" id="pdf-modal-title" *ngIf="journal">
              {{ journal.title }}
            </h4>
            <small class="text-muted" *ngIf="journal">
              Volume {{ journal.volume }}, Issue {{ journal.number }} •
              {{ journal.year }}
            </small>
          </div>
          <div class="pdf-controls">
            <!-- Navigation Controls (only show when we have PDF.js control) -->
            <div class="btn-group me-2" *ngIf="totalPages > 0">
              <button
                class="btn btn-outline-secondary btn-sm"
                (click)="previousPage()"
                [disabled]="currentPage <= 1"
                title="Previous Page"
              >
                <i class="bi bi-chevron-left"></i>
              </button>
              <span class="btn btn-outline-secondary btn-sm disabled page-info">
                {{ currentPage }} / {{ totalPages }}
              </span>
              <button
                class="btn btn-outline-secondary btn-sm"
                (click)="nextPage()"
                [disabled]="currentPage >= totalPages"
                title="Next Page"
              >
                <i class="bi bi-chevron-right"></i>
              </button>
            </div>

            <!-- PDF Mode Indicator (when using iframe) -->
            <div
              class="btn-group me-2"
              *ngIf="totalPages === 0 && !loading && !error"
            >
              <span class="btn btn-outline-info btn-sm disabled">
                <i class="bi bi-file-pdf me-1"></i>
                PDF Viewer
              </span>
            </div>

            <!-- Zoom Controls (only show when we have PDF.js control) -->
            <div class="btn-group me-2" *ngIf="totalPages > 0">
              <button
                class="btn btn-outline-secondary btn-sm"
                (click)="zoomOut()"
                title="Zoom Out"
              >
                <i class="bi bi-zoom-out"></i>
              </button>
              <span class="btn btn-outline-secondary btn-sm disabled">
                {{ Math.round(scale * 100) }}%
              </span>
              <button
                class="btn btn-outline-secondary btn-sm"
                (click)="zoomIn()"
                title="Zoom In"
              >
                <i class="bi bi-zoom-in"></i>
              </button>
            </div>

            <!-- Window Controls -->
            <div class="btn-group">
              <button
                type="button"
                class="btn btn-outline-primary btn-sm"
                *ngIf="journal?.id"
                (click)="openFullPage()"
                title="Open this issue on its own page (bookmark or share)"
              >
                <i class="bi bi-box-arrow-up-right"></i>
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                *ngIf="journal?.id"
                (click)="copyShareLink()"
                [title]="linkCopied ? 'Link copied' : 'Copy link to this issue'"
              >
                <i
                  class="bi"
                  [class.bi-check2]="linkCopied"
                  [class.bi-link-45deg]="!linkCopied"
                ></i>
              </button>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                (click)="toggleFullscreen()"
                [title]="isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'"
              >
                <i
                  class="bi"
                  [class.bi-fullscreen-exit]="isFullscreen"
                  [class.bi-fullscreen]="!isFullscreen"
                ></i>
              </button>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                id="pdf-modal-close-btn"
                (click)="closeModal()"
                title="Close"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Modal Content: mount area must stay in DOM while loading so iframe/PDF can attach -->
        <div class="pdf-modal-content position-relative">
          <div
            *ngIf="loading && !error"
            class="loading-container position-absolute top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center bg-white bg-opacity-75"
            style="z-index: 2"
          >
            <div class="text-center">
              <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="text-muted">Loading PDF...</p>
            </div>
          </div>

          <div *ngIf="error" class="error-container">
            <div class="text-center">
              <div class="alert alert-warning" role="alert">
                <i class="bi bi-exclamation-triangle me-2"></i>
                {{ error }}
              </div>
              <button class="btn btn-primary" (click)="retryLoad()">
                <i class="bi bi-arrow-clockwise me-2"></i>
                Try Again
              </button>
            </div>
          </div>

          <div *ngIf="!error" class="pdf-canvas-container">
            <canvas
              #pdfCanvas
              class="pdf-canvas"
              [style.max-width]="'100%'"
            ></canvas>
            <div #iframeHost class="iframe-host w-100"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .pdf-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        backdrop-filter: blur(3px);
      }

      .pdf-modal-container {
        width: 95%;
        height: 90%;
        max-width: 1200px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s ease;
      }

      .pdf-modal-container.fullscreen {
        width: 100vw;
        height: 100vh;
        max-width: none;
        border-radius: 0;
      }

      .pdf-modal-container.fullscreen .pdf-modal-content {
        padding: 10px;
      }

      .pdf-modal-container.fullscreen .iframe-wrapper,
      .pdf-modal-container.fullscreen .iframe-wrapper iframe {
        width: 100% !important;
        height: 100% !important;
        min-height: calc(100vh - 120px) !important;
      }

      .pdf-modal-container.fullscreen .pdf-canvas {
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 140px);
      }

      .pdf-modal-header {
        background: #f8f9fa;
        border-bottom: 1px solid #dee2e6;
        padding: 15px 20px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 15px;
      }

      .pdf-info h4 {
        font-size: 1.1rem;
        font-weight: 600;
        color: #333;
        margin: 0;
        line-height: 1.3;
      }

      .pdf-info small {
        font-size: 0.85rem;
        color: #6c757d;
      }

      .pdf-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }

      .page-info {
        min-width: 80px;
        text-align: center;
        font-weight: 500;
      }

      .pdf-modal-content {
        flex: 1;
        overflow: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f0f0f0;
        padding: 20px;
      }

      .pdf-canvas-container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        min-height: 100%;
        width: 100%;
      }

      .iframe-host {
        min-height: 400px;
      }

      .pdf-canvas {
        max-width: 100%;
        max-height: 100%;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        background: white;
        border-radius: 4px;
      }

      .loading-container,
      .error-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        text-align: center;
      }

      @media (max-width: 768px) {
        .pdf-modal-container {
          width: 100%;
          height: 100%;
          border-radius: 0;
        }

        .pdf-modal-header {
          padding: 10px 15px;
          flex-direction: column;
          align-items: stretch;
        }

        .pdf-controls {
          justify-content: center;
        }

        .pdf-modal-content {
          padding: 10px;
        }

        .pdf-modal-container.fullscreen .iframe-wrapper,
        .pdf-modal-container.fullscreen .iframe-wrapper iframe {
          min-height: calc(100vh - 100px) !important;
        }

        .pdf-modal-container.fullscreen .pdf-canvas {
          max-width: calc(100vw - 20px);
          max-height: calc(100vh - 120px);
        }
      }
    `,
  ],
})
export class PdfModalComponent implements OnInit, OnDestroy {
  @ViewChild('pdfCanvas', { static: false })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('iframeHost', { static: false })
  iframeHost!: ElementRef<HTMLDivElement>;

  // Modal state
  isOpen = false;
  isFullscreen = false;
  journal: iJournal | null = null;

  // Loading state
  loading = true;
  error: string | null = null;
  private pdfDocument: any = null;
  private currentPageObject: any = null;

  // Viewer state
  currentPage = 1;
  totalPages = 0;
  scale = 1.2;

  // Make Math available in template
  Math = Math;

  linkCopied = false;
  private linkCopiedTimer: ReturnType<typeof setTimeout> | null = null;

  private subscriptions = new Subscription();

  private readonly boundFullscreenChange = () => this.onFullscreenChange();
  private readonly boundDocumentKeydown = (e: KeyboardEvent) =>
    this.onDocumentKeydown(e);

  constructor(
    private pdfModalService: PdfModalService,
    private firebaseService: FirebaseJournalService,
    private toast: ToastService,
    private storage: Storage,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Subscribe to modal state
    this.subscriptions.add(
      this.pdfModalService.isOpen$.subscribe((isOpen) => {
        this.isOpen = isOpen;
        if (isOpen && this.journal) {
          this.loadJournal();
        }
        if (isOpen) {
          this.linkCopied = false;
          setTimeout(() =>
            document.getElementById('pdf-modal-close-btn')?.focus()
          );
        }
      })
    );

    this.subscriptions.add(
      this.pdfModalService.journal$.subscribe((journal) => {
        this.journal = journal;
        if (journal && this.isOpen) {
          this.loadJournal();
        }
      })
    );

    this.subscriptions.add(
      this.pdfModalService.isFullscreen$.subscribe((isFullscreen) => {
        this.isFullscreen = isFullscreen;

        // Update content when fullscreen state changes
        if (!this.loading && !this.error) {
          // Use setTimeout to ensure DOM updates are complete
          setTimeout(() => {
            if (this.totalPages === 0) {
              // Update iframe dimensions for iframe mode
              this.updateIframeDimensions();
            } else if (this.totalPages > 0) {
              // Re-render current page for PDF.js mode to adjust scale
              this.renderPage(this.currentPage);
            }
          }, 100);
        }
      })
    );

    document.addEventListener('fullscreenchange', this.boundFullscreenChange);
    document.addEventListener('keydown', this.boundDocumentKeydown);
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    document.removeEventListener(
      'fullscreenchange',
      this.boundFullscreenChange
    );
    document.removeEventListener('keydown', this.boundDocumentKeydown);
    if (this.linkCopiedTimer) {
      clearTimeout(this.linkCopiedTimer);
    }

    // Clean up PDF document
    if (this.pdfDocument) {
      this.pdfDocument.destroy();
    }
  }

  private onFullscreenChange() {
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    this.pdfModalService['isFullscreenSubject'].next(isCurrentlyFullscreen);

    // Update content when browser fullscreen state changes
    if (!this.loading && !this.error) {
      // Use setTimeout to ensure DOM updates are complete
      setTimeout(() => {
        if (this.totalPages === 0) {
          // Update iframe dimensions for iframe mode
          this.updateIframeDimensions();
        } else if (this.totalPages > 0) {
          // Re-render current page for PDF.js mode to adjust scale
          this.renderPage(this.currentPage);
        }
      }, 100);
    }
  }

  private updateIframeDimensions() {
    const iframe = document.getElementById('pdf-iframe') as HTMLIFrameElement;
    const wrapper = document.querySelector('.iframe-wrapper') as HTMLElement;

    if (iframe && wrapper) {
      // Calculate responsive height
      let iframeHeight: string;
      if (this.isFullscreen) {
        // Check if mobile
        const isMobile = window.innerWidth <= 768;
        iframeHeight = isMobile ? 'calc(100vh - 100px)' : 'calc(100vh - 120px)';
      } else {
        iframeHeight = '600px';
      }

      const borderRadius = this.isFullscreen ? '0' : '4px';

      wrapper.style.minHeight = iframeHeight;
      iframe.style.minHeight = iframeHeight;
      iframe.style.borderRadius = borderRadius;

      console.log(
        `📐 Updated iframe dimensions for fullscreen: ${this.isFullscreen}, height: ${iframeHeight}`
      );
    }
  }

  private onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.isOpen) {
      event.preventDefault();
      this.closeModal();
    }
  }

  onDialogKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') {
      return;
    }
    const container = event.currentTarget as HTMLElement;
    const list = this.getFocusables(container);
    if (list.length === 0) {
      return;
    }
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  private getFocusables(container: HTMLElement): HTMLElement[] {
    const sel =
      'button:not([disabled]), a[href]:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(container.querySelectorAll<HTMLElement>(sel)).filter(
      (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
  }

  openFullPage() {
    const id = this.journal?.id;
    if (!id) {
      return;
    }
    this.pdfModalService.closeModal();
    void this.router.navigate(['/journal', id]);
  }

  copyShareLink() {
    const id = this.journal?.id;
    if (!id) {
      return;
    }
    const url = `${window.location.origin}/journal/${id}`;
    const done = () => {
      this.linkCopied = true;
      if (this.linkCopiedTimer) {
        clearTimeout(this.linkCopiedTimer);
      }
      this.linkCopiedTimer = setTimeout(() => (this.linkCopied = false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {
        window.prompt('Copy this link:', url);
      });
    } else {
      window.prompt('Copy this link:', url);
    }
  }

  onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  closeModal() {
    this.pdfModalService.closeModal();
  }

  toggleFullscreen() {
    this.pdfModalService.toggleFullscreen();
  }

  private async loadJournal() {
    if (!this.journal?.id) {
      this.error = 'Journal ID is missing';
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = null;
    this.resetPdfDisplay();

    this.subscriptions.add(
      this.firebaseService
        .getJournalById(this.journal.id)
        .pipe(take(1))
        .subscribe({
          next: async (journal) => {
            const jid = journal?.id;
            const pdfUrl = journal?.pdfUrl;
            if (jid && pdfUrl) {
              if (this.firebaseService.consumeJournalViewSlot(jid)) {
                void this.firebaseService.incrementViewCount(jid).catch((err) => {
                  console.error('View count increment failed:', err);
                  this.firebaseService.clearJournalViewDedupe(jid);
                  this.toast.show(
                    'Could not record this view. Deploy firestore.rules and ensure App Check is not blocking Firestore.',
                    'warning'
                  );
                });
              }
              await this.loadPDF({ id: jid, pdfUrl });
            } else {
              this.error = 'PDF not available for this journal';
              this.loading = false;
            }
          },
          error: (error) => {
            console.error('Error loading journal:', error);
            this.error = 'Failed to load journal';
            this.loading = false;
          },
        })
    );
  }

  private async loadPDF(journal: { id: string; pdfUrl: string }) {
    const viewerUrl = publicPdfDisplayUrl(journal.id, journal.pdfUrl);
    const storageUrl = journal.pdfUrl;
    try {
      console.log('Loading PDF (viewer URL):', viewerUrl);
      this.cdr.detectChanges();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );

      // Layer 1: Try iframe first (avoids CORS issues)
      try {
        console.log('🔄 Trying iframe method first...');
        this.loadPDFInIframe(viewerUrl);
        return; // Success!
      } catch (iframeError) {
        console.log('❌ Iframe method failed:', iframeError);
        this.resetPdfDisplay();

        // Layer 2: Try direct PDF.js loading
        try {
          console.log('🔄 Trying direct PDF.js loading...');

          const loadingTask = pdfjsLib.getDocument({
            url: viewerUrl,
            cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
            cMapPacked: true,
          });

          this.pdfDocument = await loadingTask.promise;
          this.totalPages = this.pdfDocument.numPages;

          console.log('✅ PDF loaded directly. Total pages:', this.totalPages);

          await this.renderPage(1);
          this.loading = false;
          return; // Success!
        } catch (directError) {
          console.log('❌ Direct PDF.js loading failed:', directError);

          // Layer 3: Try Firebase Storage getBlob() as last resort
          try {
            const storagePath = this.extractStoragePathFromUrl(storageUrl);
            if (!storagePath) {
              throw new Error('Could not extract storage path from URL');
            }

            const storageRef = ref(this.storage, storagePath);
            const blob = await getBlob(storageRef);
            const arrayBuffer = await blob.arrayBuffer();

            // Load PDF from ArrayBuffer using PDF.js
            const loadingTask = pdfjsLib.getDocument({
              data: arrayBuffer,
              cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
              cMapPacked: true,
            });

            this.pdfDocument = await loadingTask.promise;
            this.totalPages = this.pdfDocument.numPages;

            console.log(
              '✅ PDF loaded with Firebase SDK. Total pages:',
              this.totalPages
            );

            // Render the first page
            await this.renderPage(1);
            this.loading = false;
            return; // Success!
          } catch (firebaseError) {
            console.log('❌ Firebase Storage method failed:', firebaseError);

            // Final fallback: Show error with new tab option
            this.showFinalFallback(viewerUrl);
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      this.showFinalFallback(viewerUrl);
    }
  }

  private extractStoragePathFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // For Firebase Storage URLs, extract the path after /o/
      const match = pathname.match(/\/o\/(.+?)(\?|$)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }

      return null;
    } catch (error) {
      console.error('Error extracting storage path:', error);
      return null;
    }
  }

  private async renderPage(pageNumber: number) {
    if (!this.pdfDocument || !this.canvasRef?.nativeElement) {
      return;
    }

    try {
      // Clean up previous page
      if (this.currentPageObject) {
        this.currentPageObject.cleanup();
      }

      // Get the page
      this.currentPageObject = await this.pdfDocument.getPage(pageNumber);

      // Calculate scale based on fullscreen state and container size
      let effectiveScale = this.scale;
      if (this.isFullscreen) {
        // In fullscreen, we might want to scale up for better readability
        const container = document.querySelector('.pdf-canvas-container');
        if (container) {
          const containerWidth = container.clientWidth;
          const containerHeight = container.clientHeight;
          const baseViewport = this.currentPageObject.getViewport({ scale: 1 });

          // Calculate scale to fit width or height, whichever is more restrictive
          const scaleX = (containerWidth - 40) / baseViewport.width;
          const scaleY = (containerHeight - 40) / baseViewport.height;
          const autoScale = Math.min(scaleX, scaleY);

          // Use auto scale if it's reasonable, otherwise use current scale
          if (autoScale > 0.5 && autoScale < 3) {
            effectiveScale = autoScale * this.scale;
          }
        }
      }

      const viewport = this.currentPageObject.getViewport({
        scale: effectiveScale,
      });

      // Set up canvas
      const canvas = this.canvasRef.nativeElement;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render the page
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await this.currentPageObject.render(renderContext).promise;
      this.currentPage = pageNumber;

      console.log(
        `✅ Page ${pageNumber} rendered successfully with scale ${effectiveScale.toFixed(
          2
        )}`
      );
    } catch (error) {
      console.error('Error rendering page:', error);
      this.error = 'Failed to render PDF page';
    }
  }

  // Navigation methods
  previousPage() {
    if (this.currentPage > 1) {
      this.renderPage(this.currentPage - 1);
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.renderPage(this.currentPage + 1);
    }
  }

  // Zoom methods
  zoomIn() {
    this.scale = Math.min(this.scale * 1.2, 3);
    this.renderPage(this.currentPage);
  }

  zoomOut() {
    this.scale = Math.max(this.scale / 1.2, 0.5);
    this.renderPage(this.currentPage);
  }

  retryLoad() {
    if (this.journal?.id) {
      this.loadJournal();
    }
  }

  private resetPdfDisplay() {
    const host = this.iframeHost?.nativeElement;
    if (host) {
      host.innerHTML = '';
    }
    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.style.display = 'block';
    }
  }

  private loadPDFInIframe(pdfUrl: string) {
    try {
      const host = this.iframeHost?.nativeElement;
      if (!host) {
        throw new Error('PDF iframe host not ready');
      }
      this.createIframeContent(host, pdfUrl);
      const canvas = this.canvasRef?.nativeElement;
      if (canvas) {
        canvas.style.display = 'none';
      }

      this.loading = false;
      this.error = null;
      this.totalPages = 0; // Can't get page count from iframe
      this.currentPage = 1;

      console.log('✅ PDF loaded in iframe successfully');
    } catch (iframeError) {
      console.log('❌ Iframe approach failed:', iframeError);
      throw iframeError; // Re-throw to trigger next fallback
    }
  }

  private createIframeContent(host: Element, pdfUrl: string) {
    // Calculate responsive height
    let iframeHeight: string;
    if (this.isFullscreen) {
      // Check if mobile
      const isMobile = window.innerWidth <= 768;
      iframeHeight = isMobile ? 'calc(100vh - 100px)' : 'calc(100vh - 120px)';
    } else {
      iframeHeight = '600px';
    }

    const borderRadius = this.isFullscreen ? '0' : '4px';

    host.innerHTML = `
      <div class="iframe-wrapper" style="width: 100%; height: 100%; min-height: ${iframeHeight};">
        <iframe 
          id="pdf-iframe"
          src="${pdfUrl}" 
          width="100%" 
          height="100%" 
          style="border: none; border-radius: ${borderRadius}; min-height: ${iframeHeight};"
          title="Journal PDF"
          onload="console.log('PDF iframe loaded successfully')">
          <p>Your browser does not support iframes. 
             <a href="${pdfUrl}" target="_blank">Click here to open the PDF in a new tab</a>
          </p>
        </iframe>
      </div>
    `;
  }

  private showFinalFallback(pdfUrl: string) {
    this.loading = false;
    this.error = null;
    this.totalPages = 0;
    this.currentPage = 1;

    const host = this.iframeHost?.nativeElement;
    if (host) {
      host.innerHTML = `
        <div class="text-center py-5">
          <div class="card mx-auto" style="max-width: 400px;">
            <div class="card-body">
              <i class="bi bi-file-pdf display-1 text-danger mb-3"></i>
              <h5>PDF Viewer Issue</h5>
              <p class="text-muted mb-4">
                Unable to display PDF in the modal due to security restrictions. You can open it in a new tab for viewing.
              </p>
              <a href="${pdfUrl}" target="_blank" class="btn btn-primary">
                <i class="bi bi-external-link me-2"></i>
                Open PDF in New Tab
              </a>
            </div>
          </div>
        </div>
      `;
    }

    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.style.display = 'none';
    }

    console.log('📄 Final fallback: PDF will open in new tab');
  }
}
