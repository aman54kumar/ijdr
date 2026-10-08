// Pure helpers for the Phase 5 AI features (unit tested in ai.test.ts).
import { createHash } from 'node:crypto';

export interface AiSettings {
  summaries: boolean;
  translation: boolean;
  chat: boolean;
  semanticSearch: boolean;
}

export type AiFeature = keyof AiSettings;

/** Missing doc or non-true values mean OFF: nothing public runs until an admin switches it on. */
export function parseAiSettings(raw: unknown): AiSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    summaries: r['summaries'] === true,
    translation: r['translation'] === true,
    chat: r['chat'] === true,
    semanticSearch: r['semanticSearch'] === true,
  };
}

/** UTC day key, e.g. 2026-10-07. */
export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Visitor key for rate limits: a salted hash, so raw IPs are never stored. */
export function visitorKey(ip: string | undefined, salt: string): string {
  return createHash('sha256').update(`${salt}|${ip ?? 'unknown'}`).digest('hex').slice(0, 24);
}

export const MAX_QUESTION_CHARS = 400;

/** Trim, collapse whitespace, cap length. Returns null if nothing usable is left. */
export function cleanQuestion(q: unknown): string | null {
  if (typeof q !== 'string') return null;
  const t = q.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 3) return null;
  return t.slice(0, MAX_QUESTION_CHARS);
}

export interface ChatAnswer {
  answerable: boolean;
  answer: string;
  /** PDF page numbers (file page index), sorted, unique, inside the article range. */
  pages: number[];
}

/**
 * Validate the model's chat JSON. `pageStart` is the file page of attachment page 1;
 * `pageCount` is the number of pages in the attachment. Out-of-range citations are dropped.
 * An "answerable" answer with no valid page citation is downgraded: we only show cited answers.
 */
export function validateChat(raw: unknown, pageStart: number, pageCount: number): ChatAnswer {
  const r = (raw ?? {}) as Record<string, unknown>;
  const answer = typeof r['answer'] === 'string' ? r['answer'].trim().slice(0, 1500) : '';
  const cited = (Array.isArray(r['pages']) ? r['pages'] : [])
    .filter((p): p is number => Number.isInteger(p) && p >= 1 && p <= pageCount)
    .map((p) => pageStart + p - 1);
  const pages = [...new Set(cited)].sort((a, b) => a - b);
  if (r['answerable'] !== true || !answer || !pages.length) {
    return {
      answerable: false,
      answer: answer && r['answerable'] !== true ? answer : 'This article does not seem to answer that question.',
      pages: [],
    };
  }
  return { answerable: true, answer, pages };
}

export interface SummaryContent {
  text: string;
  keyPoints: string[];
}

export function validateSummary(raw: unknown): SummaryContent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = typeof r['text'] === 'string' ? r['text'].trim().slice(0, 2000) : '';
  const keyPoints = (Array.isArray(r['keyPoints']) ? r['keyPoints'] : [])
    .filter((k): k is string => typeof k === 'string' && !!k.trim())
    .map((k) => k.trim().slice(0, 300))
    .slice(0, 6);
  if (!text) {
    throw new Error('empty-summary');
  }
  return { text, keyPoints };
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function topK(
  query: number[],
  items: { id: string; vector: number[] }[],
  k: number,
  excludeId?: string,
  minScore = 0.3
): { id: string; score: number }[] {
  return items
    .filter((i) => i.id !== excludeId)
    .map((i) => ({ id: i.id, score: cosine(query, i.vector) }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Text embedded for an article: title, abstract and keywords. */
export function embeddingText(a: { title: string; abstract?: string; keywords?: string[] }): string {
  return [a.title, a.abstract ?? '', (a.keywords ?? []).join(', ')].filter(Boolean).join('\n\n').slice(0, 6000);
}
