import { Injectable, inject } from '@angular/core';
import { AppCheckService } from './app-check.service';
import {
  Firestore, Timestamp, arrayUnion, collection, collectionData, doc, orderBy, query, updateDoc,
} from '@angular/fire/firestore';
import { Storage, getBlob, ref } from '@angular/fire/storage';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Submission, SubmissionStatus } from '../type/journals.type';
import { AuditService } from './audit.service';

export const MAX_MANUSCRIPT_BYTES = 15 * 1024 * 1024;
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
const OK_EXT = /\.(pdf|docx?)$/i;

/** Client-side check (the function re-checks everything, including the real file signature). */
export function checkFile(kind: 'manuscript' | 'coverLetter', file: File): string | null {
  const label = kind === 'manuscript' ? 'The manuscript' : 'The cover letter';
  const max = kind === 'manuscript' ? MAX_MANUSCRIPT_BYTES : MAX_COVER_BYTES;
  if (!OK_EXT.test(file.name)) return `${label} must be a PDF, DOC or DOCX file.`;
  if (file.size === 0) return `${label} file is empty.`;
  if (file.size > max) return `${label} must be smaller than ${max / 1048576} MB.`;
  return null;
}

/** `/api/submit` in production (Hosting rewrite); the function URL itself for local development. */
export const SUBMIT_URL = environment.production
  ? '/api/submit'
  : 'https://us-central1-ijdr-e41d4.cloudfunctions.net/submitManuscript';

@Injectable({ providedIn: 'root' })
export class SubmissionService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private appCheck = inject(AppCheckService);
  private audit = inject(AuditService);

  /** Begin loading App Check in the background when the form is shown. */
  prepare(): void {
    this.appCheck.warmUp();
  }

  get available(): boolean {
    return this.appCheck.enabled;
  }

  /** Upload a submission. Resolves with the reference id; rejects with a message fit to show the author. */
  async submit(form: FormData): Promise<string> {
    if (!this.appCheck.enabled) throw new Error('Online submission is not available right now. Please email the editor.');
    let token: string;
    try {
      token = await this.appCheck.token();
    } catch {
      throw new Error('Could not verify this browser. Reload the page and try again.');
    }
    let res: Response;
    try {
      res = await fetch(SUBMIT_URL, { method: 'POST', body: form, headers: { 'X-Firebase-AppCheck': token } });
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !body.id) throw new Error(body.error || 'The submission failed. Please try again.');
    return body.id;
  }

  // ---- admin ----
  list(): Observable<Submission[]> {
    return collectionData(query(collection(this.firestore, 'submissions'), orderBy('createdAt', 'desc')), {
      idField: 'id',
    }) as Observable<Submission[]>;
  }

  async setStatus(s: Submission, status: SubmissionStatus, by: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'submissions', s.id), {
      status,
      history: arrayUnion({ status, at: Timestamp.now(), by }),
      updatedAt: Timestamp.now(),
    });
    await this.audit.log({
      action: 'submission.status',
      targetType: 'submission',
      targetId: s.id,
      title: s.title,
      detail: `${s.status} -> ${status}`,
    });
  }

  async addNote(s: Submission, text: string, by: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'submissions', s.id), {
      notes: arrayUnion({ text: text.trim().slice(0, 2000), at: Timestamp.now(), by }),
      updatedAt: Timestamp.now(),
    });
  }

  /** Download a stored file as the signed-in admin and hand it to the browser. */
  async download(file: Submission['files'][number]): Promise<void> {
    const blob = await getBlob(ref(this.storage, file.path));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}
