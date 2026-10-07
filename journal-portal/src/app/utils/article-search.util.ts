import { iArticle } from '../type/journals.type';

const MAX_TOKENS = 120;
const MIN_TOKEN_LENGTH = 2;
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'it', 'of', 'on', 'or', 'the', 'to', 'with',
]);

/**
 * Lowercase, split on anything that is not a letter or digit, drop accents on
 * Latin letters (combining marks are only stripped in U+0300-U+036F so Devanagari
 * vowel signs survive), drop stopwords and duplicates.
 */
export function tokenize(text: string | undefined | null): string[] {
  if (!text) {
    return [];
  }
  const folded = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of folded.split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Tokens from title, author names and keywords, for `array-contains-any` search. */
export function buildSearchTokens(
  a: Pick<iArticle, 'title' | 'authors' | 'keywords'>
): string[] {
  const parts = [a.title, ...a.authors.map((x) => x.name), ...a.keywords];
  const seen = new Set<string>();
  for (const p of parts) {
    for (const t of tokenize(p)) {
      seen.add(t);
    }
  }
  return [...seen].slice(0, MAX_TOKENS);
}

/** Trim, drop empties and case-insensitive duplicates, keep first spelling. */
export function normalizeKeywords(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const v = k.trim().replace(/\s+/g, ' ');
    const key = v.toLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}
