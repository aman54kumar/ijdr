import { Injectable, inject } from '@angular/core';
import { Storage, ref, getBlob } from '@angular/fire/storage';
import * as pdfjsLib from 'pdfjs-dist';
import {
  FirebaseJournal,
  FirebaseJournalService,
} from './firebase-journal.service';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

/** Cover thumbnails are rendered at this width (px); height follows the page. */
export const COVER_WIDTH = 400;

@Injectable({ providedIn: 'root' })
export class CoverService {
  private storage = inject(Storage);
  private journals = inject(FirebaseJournalService);

  /**
   * Render page 1 of a PDF to a JPEG blob. A URL source is read with HTTP range
   * requests, so only the bytes page 1 needs are downloaded (issues are 8-60 MB).
   */
  async renderCover(pdf: ArrayBuffer | string): Promise<Blob> {
    const task = pdfjsLib.getDocument(
      typeof pdf === 'string'
        ? { url: pdf, disableAutoFetch: true, rangeChunkSize: 262144 }
        : { data: new Uint8Array(pdf) }
    );
    const doc = await task.promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not encode cover'))),
          'image/jpeg',
          0.82
        )
      );
    } finally {
      await doc.destroy();
    }
  }

  /** Generate and store the cover for an issue from a PDF file the admin just selected. */
  async generateFromFile(journalId: string, file: File): Promise<string> {
    const jpeg = await this.renderCover(await file.arrayBuffer());
    return this.journals.saveJournalCover(journalId, jpeg);
  }

  /** Backfill: read the issue's stored PDF (by its download URL) and generate its cover. */
  async generateFromStored(journal: FirebaseJournal): Promise<string> {
    let jpeg: Blob;
    try {
      jpeg = await this.renderCover(journal.pdfUrl);
    } catch (urlError) {
      // Range/URL access can be blocked (CORS); try the Firebase SDK, then give up with a clear reason.
      try {
        jpeg = await this.renderCover(await this.downloadViaSdk(journal));
      } catch {
        throw this.explain(urlError);
      }
    }
    return this.journals.saveJournalCover(journal.id!, jpeg);
  }

  /** Generate covers for every issue without one. Reports progress; continues past failures. */
  async backfillMissing(
    journals: FirebaseJournal[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ done: number; failed: string[]; reason?: string }> {
    const missing = journals.filter((j) => j.id && !j.coverUrl && j.pdfUrl);
    const failed: string[] = [];
    let reason: string | undefined;
    let done = 0;
    for (const j of missing) {
      try {
        await this.generateFromStored(j);
        done++;
      } catch (e) {
        console.warn('Cover generation failed for', j.id, e);
        failed.push(j.title);
        reason ??= e instanceof Error ? e.message : String(e);
      }
      onProgress?.(done + failed.length, missing.length);
    }
    return { done, failed, reason };
  }

  private async downloadViaSdk(journal: FirebaseJournal): Promise<ArrayBuffer> {
    const path = this.storagePath(journal.pdfUrl);
    if (!path) {
      throw new Error('Could not work out the PDF storage path');
    }
    return (await getBlob(ref(this.storage, path))).arrayBuffer();
  }

  /** `.../o/<encoded path>?alt=media&token=...` -> decoded object path. */
  private storagePath(downloadUrl: string): string | null {
    try {
      const m = new URL(downloadUrl).pathname.match(/\/o\/(.+)$/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  }

  private explain(e: unknown): Error {
    const msg = e instanceof Error ? e.message : String(e);
    return new Error(
      /fetch|network|cors|Unexpected server response|Failed/i.test(msg)
        ? `PDF could not be downloaded (${msg}). The Storage bucket probably needs CORS for this site.`
        : msg
    );
  }
}
