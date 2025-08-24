import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FirebaseJournalService } from '../../services/firebase-journal.service';
import { iJournal } from '../../type/journals.type';
import * as pdfjsLib from 'pdfjs-dist';
import { Storage, ref, getBlob } from '@angular/fire/storage';

// Set the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
console.log(
  'PDF.js worker configured to:',
  pdfjsLib.GlobalWorkerOptions.workerSrc
);

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pdf-viewer-container">
      <!-- Header -->
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
              <div class="btn-group me-3">
                <button
                  class="btn btn-outline-secondary btn-sm"
                  (click)="previousPage()"
                  [disabled]="currentPage <= 1"
                >
                  <i class="bi bi-chevron-left"></i> Previous
                </button>
                <button
                  class="btn btn-outline-secondary btn-sm"
                  (click)="nextPage()"
                  [disabled]="currentPage >= totalPages"
                >
                  Next <i class="bi bi-chevron-right"></i>
                </button>
              </div>
              <span class="page-info me-3">
                Page {{ currentPage }} of {{ totalPages }}
              </span>
              <div class="btn-group me-3">
                <button
                  class="btn btn-outline-secondary btn-sm"
                  (click)="zoomOut()"
                >
                  <i class="bi bi-zoom-out"></i>
                </button>
                <span class="btn btn-outline-secondary btn-sm disabled"
                  >{{ Math.round(scale * 100) }}%</span
                >
                <button
                  class="btn btn-outline-secondary btn-sm"
                  (click)="zoomIn()"
                >
                  <i class="bi bi-zoom-in"></i>
                </button>
              </div>
              <button class="btn btn-outline-primary btn-sm" (click)="goBack()">
                <i class="bi bi-arrow-left"></i> Back
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div *ngIf="loading" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading PDF...</span>
        </div>
        <p class="mt-2">Loading PDF...</p>
      </div>

      <!-- Error -->
      <div *ngIf="error" class="text-center py-5">
        <div class="alert alert-danger mx-auto" style="max-width: 500px;">
          <i class="bi bi-exclamation-triangle"></i>
          {{ error }}
        </div>
        <button class="btn btn-primary" (click)="goBack()">Go Back</button>
      </div>

      <!-- PDF Canvas Container -->
      <div *ngIf="!loading && !error" class="pdf-content">
        <div class="canvas-container d-flex justify-content-center">
          <canvas
            #pdfCanvas
            class="pdf-canvas shadow"
            [style.max-width]="'100%'"
          ></canvas>
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

      .canvas-container {
        padding: 20px 0;
      }

      .pdf-canvas {
        max-width: 100%;
        height: auto;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        background: white;
      }

      .page-info {
        font-size: 0.9rem;
        font-weight: 500;
      }

      @media (max-width: 768px) {
        .pdf-controls {
          flex-wrap: wrap;
          gap: 10px;
        }

        .page-info {
          order: -1;
          width: 100%;
          text-align: center;
          margin-bottom: 10px;
        }
      }
    `,
  ],
})
export class PdfViewerComponent implements OnInit, OnDestroy {
  @ViewChild('pdfCanvas', { static: false })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  journal: iJournal | null = null;
  loading = true;
  error: string | null = null;

  // PDF.js objects
  private pdfDocument: any = null;
  private currentPageObject: any = null;

  // Viewer state
  currentPage = 1;
  totalPages = 0;
  scale = 1.2;

  // Use inject() to get Storage instance - this avoids injection context issues
  private storage = inject(Storage);

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private firebaseService: FirebaseJournalService
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
    this.cleanup();
  }

  private cleanup() {
    if (this.currentPageObject) {
      this.currentPageObject.cleanup();
    }
    if (this.pdfDocument) {
      this.pdfDocument.destroy();
    }
  }

  private async loadJournal(journalId: string) {
    try {
      this.loading = true;
      this.error = null;

      // Get journal details
      this.firebaseService.getJournalById(journalId).subscribe({
        next: async (journal) => {
          if (journal && journal.pdfUrl && journal.id) {
            // Map FirebaseJournal to iJournal
            this.journal = {
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
            } as iJournal;
            await this.loadPDF(journal.pdfUrl);
          } else {
            this.error = 'Journal or PDF not found';
            this.loading = false;
          }
        },
        error: (error) => {
          console.error('Error loading journal:', error);
          this.error = 'Failed to load journal details';
          this.loading = false;
        },
      });
    } catch (error) {
      console.error('Error in loadJournal:', error);
      this.error = 'Failed to load journal';
      this.loading = false;
    }
  }

  private async loadPDF(pdfUrl: string) {
    try {
      console.log('Loading PDF from URL:', pdfUrl);

      // Try Firebase Storage getBlob() first to bypass CORS
      try {
        console.log('Attempting Firebase Storage getBlob() method...');

        // Extract storage path from Firebase Storage URL
        const storagePath = this.extractStoragePathFromUrl(pdfUrl);
        if (!storagePath) {
          throw new Error('Could not extract storage path from URL');
        }

        console.log('Extracted storage path:', storagePath);

        // Use Firebase Storage getBlob to fetch PDF without CORS issues
        const storageRef = ref(this.storage, storagePath);
        const blob = await getBlob(storageRef);

        console.log('PDF blob fetched successfully, size:', blob.size);

        // Convert blob to ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();
        console.log(
          'Blob converted to ArrayBuffer, size:',
          arrayBuffer.byteLength
        );

        // Load PDF from ArrayBuffer using PDF.js
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
          cMapPacked: true,
        });

        this.pdfDocument = await loadingTask.promise;
        this.totalPages = this.pdfDocument.numPages;

        console.log(
          '✅ PDF loaded successfully with Firebase SDK + PDF.js. Total pages:',
          this.totalPages
        );

        // Render the first page
        await this.renderPage(1);
        this.loading = false;
        return; // Success! Exit the method
      } catch (firebaseError) {
        console.log('❌ Firebase Storage method failed:', firebaseError);
        console.log('🔄 Trying iframe approach as fallback...');

        // Fallback to iframe approach
        this.loadPDFInIframe(pdfUrl);
        return; // Let iframe handle it
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      this.error = 'Failed to load PDF file. Please try again.';
      this.loading = false;
    }
  }

  private extractStoragePathFromUrl(firebaseUrl: string): string | null {
    try {
      // Firebase Storage URL format:
      // https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
      const url = new URL(firebaseUrl);
      const pathParts = url.pathname.split('/');

      // Find the 'o' segment and get everything after it
      const oIndex = pathParts.findIndex((part) => part === 'o');
      if (oIndex === -1 || oIndex === pathParts.length - 1) {
        return null;
      }

      // Get the encoded path after '/o/'
      const encodedPath = pathParts.slice(oIndex + 1).join('/');

      // Decode the path (Firebase Storage encodes paths)
      const decodedPath = decodeURIComponent(encodedPath);

      console.log('Decoded storage path:', decodedPath);
      return decodedPath;
    } catch (error) {
      console.error('Error extracting storage path:', error);
      return null;
    }
  }

  private loadPDFInIframe(pdfUrl: string) {
    try {
      // Create iframe to display PDF
      const container = document.querySelector('.pdf-content');
      if (container) {
        container.innerHTML = `
          <div class="pdf-iframe-container">
            <div class="pdf-header d-flex justify-content-between align-items-center mb-3">
              <h5 class="mb-0">${this.journal?.title || 'Journal PDF'}</h5>
              <div class="btn-group">
                <button onclick="history.back()" class="btn btn-secondary btn-sm">
                  <i class="bi bi-arrow-left me-1"></i>
                  Back
                </button>
                <a href="${pdfUrl}" target="_blank" class="btn btn-primary btn-sm">
                  <i class="bi bi-external-link me-1"></i>
                  Open in New Tab
                </a>
              </div>
            </div>
            <div class="iframe-wrapper">
              <iframe 
                src="${pdfUrl}" 
                width="100%" 
                height="800px" 
                style="border: 1px solid #dee2e6; border-radius: 0.375rem;"
                title="Journal PDF">
                <p>Your browser does not support iframes. 
                   <a href="${pdfUrl}" target="_blank">Click here to open the PDF in a new tab</a>
                </p>
              </iframe>
            </div>
          </div>
        `;
      }

      this.loading = false;
      this.error = null;

      console.log('PDF loaded in iframe successfully');
    } catch (iframeError) {
      console.log('Iframe approach failed, opening in new tab:', iframeError);
      this.openPDFInNewTab(pdfUrl);
    }
  }

  private openPDFInNewTab(pdfUrl: string) {
    // Open PDF in new tab/window - this bypasses CORS completely
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');

    // Show message to user
    this.loading = false;
    this.error = null;

    // Update the view to show that PDF was opened externally
    const container = document.querySelector('.pdf-content');
    if (container) {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="card mx-auto" style="max-width: 500px;">
            <div class="card-body">
              <i class="bi bi-external-link display-1 text-success mb-3"></i>
              <h4>PDF Opened Successfully</h4>
              <p class="text-muted mb-4">
                The journal PDF has been opened in a new tab/window.
              </p>
              <button onclick="history.back()" class="btn btn-primary">
                <i class="bi bi-arrow-left me-2"></i>
                Go Back
              </button>
            </div>
          </div>
        </div>
      `;
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
      const viewport = this.currentPageObject.getViewport({
        scale: this.scale,
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

      console.log('Rendered page:', pageNumber);
    } catch (error) {
      console.error('Error rendering page:', error);
      this.error = 'Failed to render PDF page';
    }
  }

  // Navigation methods
  async nextPage() {
    if (this.currentPage < this.totalPages) {
      await this.renderPage(this.currentPage + 1);
    }
  }

  async previousPage() {
    if (this.currentPage > 1) {
      await this.renderPage(this.currentPage - 1);
    }
  }

  // Zoom methods
  async zoomIn() {
    this.scale = Math.min(this.scale + 0.2, 3.0);
    await this.renderPage(this.currentPage);
  }

  async zoomOut() {
    this.scale = Math.max(this.scale - 0.2, 0.5);
    await this.renderPage(this.currentPage);
  }

  goBack() {
    this.router.navigate(['/journals']);
  }

  // Utility
  Math = Math;
}
