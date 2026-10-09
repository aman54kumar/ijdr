import { Injectable, inject } from '@angular/core';
import { Firestore, doc, docData, getDoc, setDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';
import { IngestJob } from '../type/journals.type';

/** Suggested free-tier models; admins can also type any other model id. */
export const GEMINI_MODEL_CHOICES = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
];

export interface IngestCallResult {
  created: number;
  kept: number;
  replaced: number;
  warnings: string[];
}

@Injectable({ providedIn: 'root' })
export class IngestService {
  private functions = inject(Functions);
  private firestore = inject(Firestore);

  /** Live `ingestJobs/{issueId}` (undefined until the first run). */
  watchJob(issueId: string): Observable<IngestJob | undefined> {
    return docData(doc(this.firestore, 'ingestJobs', issueId)) as Observable<IngestJob | undefined>;
  }

  /** Models saved in `adminSettings/ai` (empty = server default). */
  async getModels(): Promise<{ model: string; publicModel: string }> {
    const d = (await getDoc(doc(this.firestore, 'adminSettings', 'ai'))).data() ?? {};
    return {
      model: typeof d['model'] === 'string' ? d['model'] : '',
      publicModel: typeof d['publicModel'] === 'string' ? d['publicModel'] : '',
    };
  }

  async setModels(models: { model: string; publicModel: string }): Promise<void> {
    await setDoc(doc(this.firestore, 'adminSettings', 'ai'), models, { merge: true });
  }

  /** Start extraction. Resolves when the function finishes (up to ~9 minutes). */
  async extract(issueId: string): Promise<IngestCallResult> {
    const call = httpsCallable<{ issueId: string }, IngestCallResult>(this.functions, 'ingestIssue', {
      timeout: 540_000,
    });
    return (await call({ issueId })).data;
  }
}

/** Plain-language text for a failed callable (HttpsError messages are already admin-readable). */
export function ingestErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (err?.code === 'functions/deadline-exceeded') {
    return 'The request timed out. Check the job status below; it may still finish.';
  }
  if (err?.code === 'functions/permission-denied') {
    return 'Only admins can run extraction. Sign in again if your session expired.';
  }
  return err?.message || 'Extraction failed.';
}
