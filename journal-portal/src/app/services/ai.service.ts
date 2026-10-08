import { Injectable, Injector, inject } from '@angular/core';
import { Firestore, doc, docData, getDoc, setDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AppCheckService } from './app-check.service';
import { AiSettings, AiSummary, AiTranslation, ChatReply, SemanticHit } from '../type/journals.type';

export const AI_OFF: AiSettings = { summaries: false, translation: false, chat: false, semanticSearch: false, contactTriage: false };

/** Normalise `siteSettings/ai`: anything but `true` is off. */
export function parseAiSettings(raw: unknown): AiSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    summaries: r['summaries'] === true,
    translation: r['translation'] === true,
    chat: r['chat'] === true,
    semanticSearch: r['semanticSearch'] === true,
    contactTriage: r['contactTriage'] === true,
  };
}

/** Readable text for a failed AI call. */
export function aiErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  switch (err?.code) {
    case 'functions/failed-precondition':
    case 'functions/resource-exhausted':
    case 'functions/invalid-argument':
    case 'functions/not-found':
      return err.message || 'This is not available right now.';
    case 'functions/unauthenticated':
    case 'functions/permission-denied':
      return 'AI features are not available from this browser right now.';
    default:
      return 'The AI is not available right now. Please try again later.';
  }
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private appCheck = inject(AppCheckService);

  /** Public AI endpoints need App Check; without a configured key they are not offered at all. */
  readonly appCheckReady = this.appCheck.enabled;

  /** Functions is resolved only after App Check is up, so the first call carries a token. */
  private async fns(): Promise<Functions> {
    await this.appCheck.ensure();
    return this.injector.get(Functions);
  }

  settings$(): Observable<AiSettings> {
    return new Observable<AiSettings>((sub) => {
      const s = docData(doc(this.firestore, 'siteSettings', 'ai')).pipe(catchError(() => of(undefined))).subscribe({
        next: (v) => sub.next(parseAiSettings(v)),
        error: () => sub.next(AI_OFF),
      });
      return () => s.unsubscribe();
    });
  }

  async saveSettings(s: AiSettings): Promise<void> {
    await setDoc(doc(this.firestore, 'siteSettings', 'ai'), s);
  }

  /** Cached summary from Firestore, or undefined. No Gemini call happens here. */
  async cachedSummary(articleId: string): Promise<AiSummary | undefined> {
    try {
      const s = await getDoc(doc(this.firestore, 'articles', articleId, 'ai', 'summary'));
      return s.exists() ? (s.data() as AiSummary) : undefined;
    } catch {
      return undefined;
    }
  }

  async cachedTranslation(articleId: string): Promise<AiTranslation | undefined> {
    try {
      const s = await getDoc(doc(this.firestore, 'articles', articleId, 'ai', 'translation_hi'));
      return s.exists() ? (s.data() as AiTranslation) : undefined;
    } catch {
      return undefined;
    }
  }

  async relatedIds(articleId: string): Promise<string[]> {
    try {
      const s = await getDoc(doc(this.firestore, 'articles', articleId, 'ai', 'related'));
      const ids = s.data()?.['ids'];
      return Array.isArray(ids) ? ids : [];
    } catch {
      return [];
    }
  }

  async summarize(articleId: string): Promise<AiSummary> {
    return (await httpsCallable<{ articleId: string }, AiSummary>(await this.fns(), 'summarizeArticle', { timeout: 120_000 })({ articleId })).data;
  }

  async translate(articleId: string): Promise<AiTranslation> {
    return (await httpsCallable<{ articleId: string; lang: 'hi' }, AiTranslation>(await this.fns(), 'translateArticle', { timeout: 120_000 })({ articleId, lang: 'hi' })).data;
  }

  async ask(articleId: string, question: string): Promise<ChatReply> {
    return (await httpsCallable<{ articleId: string; question: string }, ChatReply>(await this.fns(), 'askPaper', { timeout: 90_000 })({ articleId, question })).data;
  }

  async semanticSearch(query: string): Promise<SemanticHit[]> {
    return (await httpsCallable<{ query: string }, { hits: SemanticHit[] }>(await this.fns(), 'semanticSearch', { timeout: 30_000 })({ query })).data.hits;
  }

  // ---- admin ----
  async triageContact(id: string): Promise<void> {
    await httpsCallable(await this.fns(), 'triageContact', { timeout: 90_000 })({ id });
  }

  async adminGenerate(articleId: string, kind: 'summary' | 'translation'): Promise<void> {
    await httpsCallable(await this.fns(), 'adminGenerateAi', { timeout: 180_000 })({ articleId, kind });
  }

  async adminEmbed(issueId?: string): Promise<{ embedded: number; related: number }> {
    return (await httpsCallable<{ issueId?: string }, { embedded: number; related: number }>(await this.fns(), 'embedArticles', { timeout: 300_000 })({ issueId })).data;
  }

  async setSummaryHidden(articleId: string, hidden: boolean): Promise<void> {
    await setDoc(doc(this.firestore, 'articles', articleId, 'ai', 'summary'), { hidden }, { merge: true });
  }

  async usageToday(): Promise<Record<string, number>> {
    const day = new Date().toISOString().slice(0, 10);
    try {
      return ((await getDoc(doc(this.firestore, 'aiStats', day))).data() as Record<string, number>) ?? {};
    } catch {
      return {};
    }
  }
}
