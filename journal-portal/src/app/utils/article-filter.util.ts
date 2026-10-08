import { iArticle } from '../type/journals.type';
import { tokenize } from './article-search.util';

export interface ArticleFilters {
  q?: string;
  year?: string;
  issue?: string;
  author?: string;
  keyword?: string;
  subject?: string;
}

export const FILTER_KEYS: (keyof ArticleFilters)[] = ['q', 'year', 'issue', 'author', 'keyword', 'subject'];

export function filtersFromParams(get: (k: string) => string | null): ArticleFilters {
  const f: ArticleFilters = {};
  for (const k of FILTER_KEYS) {
    const v = get(k)?.trim();
    if (v) f[k] = v;
  }
  return f;
}

export function applyFilters(list: iArticle[], f: ArticleFilters): iArticle[] {
  const qTokens = tokenize(f.q);
  return list.filter((a) => {
    if (f.year && a.issueYear !== f.year) return false;
    if (f.issue && a.issueId !== f.issue) return false;
    if (f.subject && a.subject !== f.subject) return false;
    if (f.keyword && !a.keywords.some((k) => k.toLowerCase() === f.keyword!.toLowerCase())) return false;
    if (f.author && !a.authors.some((x) => x.name === f.author)) return false;
    if (qTokens.length) {
      const have = new Set(a.searchTokens ?? tokenize(`${a.title} ${a.authors.map((x) => x.name).join(' ')} ${a.keywords.join(' ')}`));
      if (!qTokens.every((t) => have.has(t))) return false;
    }
    return true;
  });
}

export interface Facets {
  years: string[];
  issues: { id: string; label: string }[];
  authors: string[];
  keywords: string[];
  subjects: string[];
}

export function buildFacets(list: iArticle[]): Facets {
  const years = new Set<string>();
  const issues = new Map<string, string>();
  const authors = new Set<string>();
  const keywords = new Map<string, string>();
  const subjects = new Set<string>();
  for (const a of list) {
    years.add(a.issueYear);
    issues.set(a.issueId, a.issueTitle);
    a.authors.forEach((x) => authors.add(x.name));
    a.keywords.forEach((k) => keywords.set(k.toLowerCase(), keywords.get(k.toLowerCase()) ?? k));
    if (a.subject) subjects.add(a.subject);
  }
  const sort = (s: Iterable<string>) => [...s].sort((a, b) => a.localeCompare(b));
  return {
    years: sort(years).reverse(),
    issues: [...issues].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
    authors: sort(authors),
    keywords: sort(keywords.values()),
    subjects: sort(subjects),
  };
}
