import { Injectable } from '@angular/core';

export type PdfJs = typeof import('pdfjs-dist');

/** Where pdf.js fetches CMaps for non-embedded CJK/CID fonts. */
export const PDFJS_CMAP_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/cmaps/';

/**
 * Loads pdf.js on first use, so the library (about 1 MB) is not part of the initial bundle
 * and is only downloaded on pages that actually show a PDF.
 */
@Injectable({ providedIn: 'root' })
export class PdfJsService {
  private lib?: Promise<PdfJs>;

  load(): Promise<PdfJs> {
    this.lib ??= import('pdfjs-dist').then((m) => {
      // pdfjs-dist 3.x is CommonJS: depending on the bundler the API sits on `default`.
      const lib: PdfJs = (m as any).GlobalWorkerOptions ? m : (m as any).default;
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      return lib;
    });
    return this.lib;
  }
}
