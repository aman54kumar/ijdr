// Mirrors journal-portal/src/app/utils/article-search.util.ts (keep in sync).
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'it', 'of', 'on', 'or', 'the', 'to', 'with',
]);

export function tokenize(text: string | undefined | null): string[] {
  if (!text) return [];
  const folded = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of folded.split(/[^\p{L}\p{M}\p{N}]+/u)) {
    if (t.length >= 2 && !STOPWORDS.has(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function buildSearchTokens(a: {
  title: string;
  authors: { name: string }[];
  keywords: string[];
}): string[] {
  const seen = new Set<string>();
  for (const p of [a.title, ...a.authors.map((x) => x.name), ...a.keywords]) {
    for (const t of tokenize(p)) seen.add(t);
  }
  return [...seen].slice(0, 120);
}
