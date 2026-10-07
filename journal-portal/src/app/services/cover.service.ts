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

  /** Render page 1 of a PDF to a JPEG blob. */
  async renderCover(pdf: ArrayBuffer): Promise<Blob> {
    const task = pdfjsLib.getDocument({ data: new Uint8Array(pdf) });
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

  /** Backfill: download the issue's stored PDF and generate its cover. */
  async generateFromStored(journal: FirebaseJournal): Promise<string> {
    const buf = await this.fetchStoredPdf(journal);
    const jpeg = await this.renderCover(buf);
    return this.journals.saveJournalCover(journal.id!, jpeg);
  }

  /** Generate covers for every issue without one. Reports progress; continues past failures. */
  async backfillMissing(
    journals: FirebaseJournal[],
    onProgress?: (done: number, total: number) => void
  ): Promise<{ done: number; failed: string[] }> {
    const missing = journals.filter((j) => j.id && !j.coverUrl && j.pdfUrl);
    const failed: string[] = [];
    let done = 0;
    for (const j of missing) {
      try {
        await this.generateFromStored(j);
        done++;
      } catch (e) {
        console.warn('Cover generation failed for', j.id, e);
        failed.push(j.title);
      }
      onProgress?.(done + failed.length, missing.length);
    }
    return { done, failed };
  }

  private async fetchStoredPdf(journal: FirebaseJournal): Promise<ArrayBuffer> {
    const path = `journals/${journal.id}/issue.pdf`;
    try {
      return await (await getBlob(ref(this.storage, path))).arrayBuffer();
    } catch {
      // Older issues may live at a different path: fall back to the download URL.
      const res = await fetch(journal.pdfUrl);
      if (!res.ok) {
        throw new Error(`PDF download failed (${res.status})`);
      }
      return res.arrayBuffer();
    }
  }
}
