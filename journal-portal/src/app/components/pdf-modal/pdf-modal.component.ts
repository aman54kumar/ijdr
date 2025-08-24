import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Storage, ref, getBlob } from '@angular/fire/storage';
import { PdfModalService } from '../../services/pdf-modal.service';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { iJournal } from '../../type/journals.type';
import { Subscription } from 'rxjs';

// Import PDF.js
declare const pdfjsLib: any;

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
      <div class="pdf-modal-container" [class.fullscreen]="isFullscreen">
        <!-- Modal Header -->
        <div class="pdf-modal-header">
          <div class="pdf-info">
            <h4 class="mb-0" *ngIf="journal">{{ journal.title }}</h4>
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
                class="btn btn-outline-danger btn-sm"
                (click)="closeModal()"
                title="Close"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- Modal Content -->
        <div class="pdf-modal-content">
          <!-- Loading State -->
          <div *ngIf="loading" class="loading-container">
            <div class="text-center">
              <div class="spinner-border text-primary mb-3" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="text-muted">Loading PDF...</p>
            </div>
          </div>

          <!-- Error State -->
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

          <!-- PDF Canvas -->
          <div *ngIf="!loading && !error" class="pdf-canvas-container">
            <canvas
              #pdfCanvas
              class="pdf-canvas"
              [style.max-width]="'100%'"
            ></canvas>
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
        justify-content: center;
        align-items: center;
        min-height: 100%;
        width: 100%;
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

  private subscriptions = new Subscription();

  constructor(
    private pdfModalService: PdfModalService,
    private firebaseService: FirebaseJournalService,
    private storage: Storage
  ) {}

  ngOnInit() {
    // Subscribe to modal state
    this.subscriptions.add(
      this.pdfModalService.isOpen$.subscribe((isOpen) => {
        this.isOpen = isOpen;
        if (isOpen && this.journal) {
          this.loadJournal();
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

    // Handle fullscreen change events
    document.addEventListener(
      'fullscreenchange',
      this.onFullscreenChange.bind(this)
    );

    // Handle ESC key to close modal
    document.addEventListener('keydown', this.onKeyDown.bind(this));
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    document.removeEventListener(
      'fullscreenchange',
      this.onFullscreenChange.bind(this)
    );
    document.removeEventListener('keydown', this.onKeyDown.bind(this));

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

  private onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.isOpen) {
      event.preventDefault();
      this.closeModal();
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

    this.subscriptions.add(
      this.firebaseService.getJournalById(this.journal.id).subscribe({
        next: async (journal) => {
          if (journal?.pdfUrl) {
            await this.loadPDF(journal.pdfUrl);
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

  private async loadPDF(pdfUrl: string) {
    try {
      console.log('Loading PDF from URL:', pdfUrl);

      // Layer 1: Try iframe first (avoids CORS issues)
      try {
        console.log('🔄 Trying iframe method first...');
        this.loadPDFInIframe(pdfUrl);
        return; // Success!
      } catch (iframeError) {
        console.log('❌ Iframe method failed:', iframeError);

        // Layer 2: Try direct PDF.js loading
        try {
          console.log('🔄 Trying direct PDF.js loading...');

          const loadingTask = pdfjsLib.getDocument({
            url: pdfUrl,
            cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
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
            const storagePath = this.extractStoragePathFromUrl(pdfUrl);
            if (!storagePath) {
              throw new Error('Could not extract storage path from URL');
            }

            const storageRef = ref(this.storage, storagePath);
            const blob = await getBlob(storageRef);
            const arrayBuffer = await blob.arrayBuffer();

            // Load PDF from ArrayBuffer using PDF.js
            const loadingTask = pdfjsLib.getDocument({
              data: arrayBuffer,
              cMapUrl:
                'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
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
            this.showFinalFallback(pdfUrl);
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      this.showFinalFallback(pdfUrl);
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

  private loadPDFInIframe(pdfUrl: string) {
    try {
      // Create iframe content for the modal
      const container = document.querySelector('.pdf-canvas-container');
      if (container) {
        this.createIframeContent(container, pdfUrl);
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

  private createIframeContent(container: Element, pdfUrl: string) {
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

    container.innerHTML = `
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

    const container = document.querySelector('.pdf-canvas-container');
    if (container) {
      container.innerHTML = `
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

    console.log('📄 Final fallback: PDF will open in new tab');
  }
}
