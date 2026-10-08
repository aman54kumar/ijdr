import { BoardMember, iArticle, iJournal } from '../type/journals.type';
import { tokenize } from './article-search.util';

export type SearchKind = 'article' | 'issue' | 'member';

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  link: string[];
  score: number;
}

function hits(queryTokens: string[], text: string | undefined): number {
  if (!text) return 0;
  const have = tokenize(text);
  let n = 0;
  for (const q of queryTokens) {
    // Whole-word match counts fully, a prefix match (typing in progress) half.
    if (have.includes(q)) n += 1;
    else if (have.some((t) => t.startsWith(q))) n += 0.5;
  }
  return n;
}

export function rankArticles(q: string, list: iArticle[]): SearchResult[] {
  const qt = tokenize(q);
  if (!qt.length) return [];
  return list
    .map((a) => {
      const score =
        hits(qt, a.title) * 3 + hits(qt, a.authors.map((x) => x.name).join(' ')) * 2 + hits(qt, a.keywords.join(' '));
      return {
        kind: 'article' as const,
        id: a.id,
        title: a.title,
        subtitle: `${a.authors.map((x) => x.name).slice(0, 2).join(', ')}${a.authors.length > 2 ? ' et al.' : ''} · ${a.issueYear}`,
        link: ['/article', a.id],
        score,
      };
    })
    .filter((r) => r.score > 0);
}

export function rankIssues(q: string, list: Pick<iJournal, 'id' | 'title' | 'volume' | 'number' | 'year' | 'edition'>[]): SearchResult[] {
  const qt = tokenize(q);
  if (!qt.length) return [];
  return list
    .map((j) => ({
      kind: 'issue' as const,
      id: j.id,
      title: j.title,
      subtitle: `Vol. ${j.volume}, No. ${j.number} · ${j.year}`,
      link: ['/journal', j.id],
      score: hits(qt, `${j.title} ${j.year} ${j.edition ?? ''} vol ${j.volume} no ${j.number}`) * 2,
    }))
    .filter((r) => r.score > 0);
}

export function rankMembers(q: string, list: Pick<BoardMember, 'id' | 'name' | 'position' | 'affiliation'>[]): SearchResult[] {
  const qt = tokenize(q);
  if (!qt.length) return [];
  return list
    .map((m) => ({
      kind: 'member' as const,
      id: m.id,
      title: m.name,
      subtitle: [m.position, m.affiliation].filter(Boolean).join(' · '),
      link: [m.position === 'Advisory Board Member' ? '/advisory-board' : '/editorial-board'],
      score: hits(qt, m.name) * 2 + hits(qt, m.affiliation) * 0.5 + hits(qt, m.position) * 0.5,
    }))
    .filter((r) => r.score > 0);
}

/** Merge groups, best first; keep at most `perKind` of each kind so one kind cannot crowd out the rest. */
export function mergeResults(groups: SearchResult[][], perKind = 6): SearchResult[] {
  return groups.flatMap((g) => [...g].sort((a, b) => b.score - a.score).slice(0, perKind));
}
