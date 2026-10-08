import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  docData,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  deleteField,
  increment,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, shareReplay } from 'rxjs';
import { map } from 'rxjs/operators';
import { iArticle, iJournal } from '../type/journals.type';
import { buildSearchTokens, normalizeKeywords } from '../utils/article-search.util';
import { AuditService } from './audit.service';

/** Fields the admin edits; everything else is derived by the service. */
export type ArticleInput = Pick<
  iArticle,
  | 'title'
  | 'authors'
  | 'abstract'
  | 'keywords'
  | 'subject'
  | 'pageStart'
  | 'pageEnd'
  | 'doi'
  | 'language'
  | 'status'
>;

type IssueFields = Pick<iJournal, 'title' | 'volume' | 'number' | 'year'>;

const BATCH_LIMIT = 450;

/** Denormalized issue fields copied onto every article. */
export function issueDenorm(
  issue: IssueFields
): Pick<iArticle, 'issueTitle' | 'issueVolume' | 'issueNumber' | 'issueYear'> {
  return {
    issueTitle: issue.title,
    issueVolume: issue.volume,
    issueNumber: issue.number,
    issueYear: issue.year,
  };
}

/** Counts and status that live on the issue doc. */
export function summarizeArticles(
  articles: Pick<iArticle, 'status'>[]
): Pick<iJournal, 'articleCount' | 'articlesStatus'> {
  const published = articles.some((a) => a.status === 'published');
  return {
    articleCount: articles.length,
    articlesStatus: articles.length === 0 ? 'none' : published ? 'published' : 'draft',
  };
}

/** Strip undefined and blank optional values; Firestore rejects undefined. */
export function cleanArticleInput(input: ArticleInput): ArticleInput {
  const authors = input.authors
    .map((a) => ({
      name: a.name.trim(),
      ...(a.affiliation?.trim() ? { affiliation: a.affiliation.trim() } : {}),
      ...(a.email?.trim() ? { email: a.email.trim() } : {}),
      ...(a.orcid?.trim() ? { orcid: a.orcid.trim() } : {}),
    }))
    .filter((a) => a.name);
  const out: ArticleInput = {
    title: input.title.trim(),
    authors,
    keywords: normalizeKeywords(input.keywords),
    status: input.status,
  };
  const abstract = input.abstract?.trim();
  if (abstract) out.abstract = abstract;
  const subject = input.subject?.trim();
  if (subject) out.subject = subject;
  const doi = input.doi?.trim();
  if (doi) out.doi = doi;
  if (input.language) out.language = input.language;
  if (input.pageStart != null) out.pageStart = input.pageStart;
  if (input.pageEnd != null) out.pageEnd = input.pageEnd;
  return out;
}

/** Rank candidates by shared keywords (case-insensitive) plus a same-subject bonus; drops the article itself and non-matches. */
export function rankRelated(article: iArticle, candidates: iArticle[], max: number): iArticle[] {
  const kws = new Set(article.keywords.map((k) => k.toLowerCase()));
  return candidates
    .filter((c) => c.id !== article.id)
    .map((c) => {
      const shared = c.keywords.filter((k) => kws.has(k.toLowerCase())).length;
      const subject = article.subject && c.subject === article.subject ? 1 : 0;
      return { c, score: shared * 2 + subject };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(b.c.issueYear).localeCompare(String(a.c.issueYear)))
    .slice(0, max)
    .map((x) => x.c);
}

@Injectable({ providedIn: 'root' })
export class ArticleService {
  private firestore = inject(Firestore);
  private audit = inject(AuditService);

  private col() {
    return collection(this.firestore, 'articles');
  }

  /** All articles of an issue in order (admin: includes drafts). */
  getArticlesByIssue(issueId: string): Observable<iArticle[]> {
    return collectionData(
      query(this.col(), where('issueId', '==', issueId), orderBy('order')),
      { idField: 'id' }
    ) as Observable<iArticle[]>;
  }

  /** Public view of an issue: published only (the rules require this filter). */
  getPublishedArticlesByIssue(issueId: string): Observable<iArticle[]> {
    return collectionData(
      query(
        this.col(),
        where('issueId', '==', issueId),
        where('status', '==', 'published'),
        orderBy('order')
      ),
      { idField: 'id' }
    ) as Observable<iArticle[]>;
  }

  getArticle(id: string): Observable<iArticle | undefined> {
    return docData(doc(this.firestore, 'articles', id), {
      idField: 'id',
    }) as Observable<iArticle | undefined>;
  }

  getRecentArticles(count = 10): Observable<iArticle[]> {
    return collectionData(
      query(
        this.col(),
        where('status', '==', 'published'),
        orderBy('createdAt', 'desc'),
        limit(count)
      ),
      { idField: 'id' }
    ) as Observable<iArticle[]>;
  }

  /** v1 token search: matches any of the query's tokens (ranking is the caller's job). */
  searchByToken(tokens: string[], max = 20): Observable<iArticle[]> {
    const t = tokens.slice(0, 30); // array-contains-any allows at most 30 values
    return collectionData(
      query(
        this.col(),
        where('status', '==', 'published'),
        where('searchTokens', 'array-contains-any', t),
        limit(max)
      ),
      { idField: 'id' }
    ) as Observable<iArticle[]>;
  }

  private publishedCorpus$?: Observable<iArticle[]>;

  /**
   * Every published article, newest first, loaded once per session (the corpus is a few
   * hundred docs at most). Powers browse filters client-side.
   */
  getPublishedCorpus(): Observable<iArticle[]> {
    this.publishedCorpus$ ??= (
      collectionData(
        query(this.col(), where('status', '==', 'published'), orderBy('createdAt', 'desc'), limit(500)),
        { idField: 'id' }
      ) as Observable<iArticle[]>
    ).pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.publishedCorpus$;
  }

  /** Published articles sharing keywords or the subject with `article`, best match first. */
  getRelated(article: iArticle, max = 4): Observable<iArticle[]> {
    const kws = article.keywords.slice(0, 10);
    if (!kws.length) {
      return new Observable((s) => {
        s.next([]);
        s.complete();
      });
    }
    return (
      collectionData(
        query(this.col(), where('status', '==', 'published'), where('keywords', 'array-contains-any', kws), limit(20)),
        { idField: 'id' }
      ) as Observable<iArticle[]>
    ).pipe(map((list) => rankRelated(article, list, max)));
  }

  /** Public view-count bump (rules allow +1 on viewCount only). */
  async incrementViewCount(id: string): Promise<void> {
    await updateDoc(doc(this.firestore, 'articles', id), { viewCount: increment(1) });
  }

  async createArticle(issue: iJournal, input: ArticleInput): Promise<string> {
    const existing = await this.fetchIssueArticles(issue.id);
    const order = existing.reduce((m, a) => Math.max(m, a.order), 0) + 1;
    const data = cleanArticleInput(input);
    const now = Timestamp.now();
    const ref = await addDoc(this.col(), {
      ...data,
      issueId: issue.id,
      source: 'manual',
      order,
      viewCount: 0,
      ...issueDenorm(issue),
      searchTokens: buildSearchTokens(data),
      createdAt: now,
      updatedAt: now,
    });
    await this.refreshIssueSummary(issue.id);
    return ref.id;
  }

  async updateArticle(article: iArticle, input: ArticleInput): Promise<void> {
    const data = cleanArticleInput(input);
    // updateDoc merges, so optional fields the admin cleared must be deleted explicitly.
    const optional = ['abstract', 'subject', 'doi', 'language', 'pageStart', 'pageEnd'] as const;
    const patch: Record<string, unknown> = { ...data };
    for (const k of optional) {
      if (!(k in data)) {
        patch[k] = deleteField();
      }
    }
    await updateDoc(doc(this.firestore, 'articles', article.id), {
      ...patch,
      searchTokens: buildSearchTokens(data),
      ...(article.source === 'ai' ? { humanEdited: true } : {}),
      updatedAt: Timestamp.now(),
    });
    await this.refreshIssueSummary(article.issueId);
  }

  async setStatus(article: iArticle, status: iArticle['status']): Promise<void> {
    await updateDoc(doc(this.firestore, 'articles', article.id), {
      status,
      updatedAt: Timestamp.now(),
    });
    await this.refreshIssueSummary(article.issueId);
    await this.audit.log({
      action: status === 'published' ? 'article.publish' : 'article.unpublish',
      targetType: 'article',
      targetId: article.id,
      title: article.title,
    });
  }

  /** Set the status of several articles at once (review screen: publish accepted). */
  async setStatusMany(articles: iArticle[], status: iArticle['status']): Promise<void> {
    for (let i = 0; i < articles.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      for (const a of articles.slice(i, i + BATCH_LIMIT)) {
        batch.update(doc(this.firestore, 'articles', a.id), { status, updatedAt: Timestamp.now() });
      }
      await batch.commit();
    }
    if (articles.length) {
      await this.refreshIssueSummary(articles[0].issueId);
      await this.audit.log({
        action: status === 'published' ? 'article.publish' : 'article.unpublish',
        targetType: 'article',
        targetId: articles[0].id,
        title: `${articles.length} articles`,
        detail: 'bulk',
      });
    }
  }

  async deleteMany(articles: iArticle[]): Promise<void> {
    for (let i = 0; i < articles.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      for (const a of articles.slice(i, i + BATCH_LIMIT)) {
        batch.delete(doc(this.firestore, 'articles', a.id));
      }
      await batch.commit();
    }
    if (articles.length) {
      await this.refreshIssueSummary(articles[0].issueId);
      await this.audit.log({
        action: 'article.delete',
        targetType: 'article',
        targetId: articles[0].id,
        title: `${articles.length} drafts`,
        detail: 'bulk reject',
      });
    }
  }

  async deleteArticle(article: iArticle): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.delete(doc(this.firestore, 'articles', article.id));
    await batch.commit();
    await this.refreshIssueSummary(article.issueId);
    await this.audit.log({ action: 'article.delete', targetType: 'article', targetId: article.id, title: article.title });
  }

  /** Persist a new order (`articles` is already in the desired sequence). */
  async reorder(articles: iArticle[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    articles.forEach((a, i) => {
      if (a.order !== i + 1) {
        batch.update(doc(this.firestore, 'articles', a.id), { order: i + 1 });
      }
    });
    await batch.commit();
  }

  /** After an issue's title/volume/number/year changes, refresh its articles. */
  async syncIssueFields(issue: iJournal): Promise<void> {
    const articles = await this.fetchIssueArticles(issue.id);
    const fields = issueDenorm(issue);
    for (let i = 0; i < articles.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      for (const a of articles.slice(i, i + BATCH_LIMIT)) {
        batch.update(doc(this.firestore, 'articles', a.id), fields);
      }
      await batch.commit();
    }
  }

  /** Delete every article of an issue (used when the issue is deleted). */
  async deleteIssueArticles(issueId: string): Promise<void> {
    const articles = await this.fetchIssueArticles(issueId);
    for (let i = 0; i < articles.length; i += BATCH_LIMIT) {
      const batch = writeBatch(this.firestore);
      for (const a of articles.slice(i, i + BATCH_LIMIT)) {
        batch.delete(doc(this.firestore, 'articles', a.id));
      }
      await batch.commit();
    }
  }

  /** Recompute `articleCount` / `articlesStatus` on the issue doc. */
  async refreshIssueSummary(issueId: string): Promise<void> {
    const articles = await this.fetchIssueArticles(issueId);
    await updateDoc(doc(this.firestore, 'journals', issueId), {
      ...summarizeArticles(articles),
      updatedAt: Timestamp.now(),
    });
  }

  private async fetchIssueArticles(issueId: string): Promise<iArticle[]> {
    const snap = await getDocs(
      query(this.col(), where('issueId', '==', issueId), orderBy('order'))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as iArticle);
  }
}
