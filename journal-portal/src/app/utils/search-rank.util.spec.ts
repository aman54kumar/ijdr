import { BoardMember, iArticle } from '../type/journals.type';
import { mergeResults, rankArticles, rankIssues, rankMembers } from './search-rank.util';

const art = (id: string, title: string, authors: string[], keywords: string[] = []) =>
  ({ id, title, authors: authors.map((name) => ({ name })), keywords, issueYear: '2024' }) as iArticle;

describe('search-rank.util', () => {
  const list = [
    art('1', 'Rural credit in Bihar', ['Ann Lee'], ['microfinance']),
    art('2', 'Water policy', ['Rural Singh']),
    art('3', 'Unrelated', ['Bo Ray']),
  ];

  it('ranks title hits above author hits and drops non-matches', () => {
    const r = rankArticles('rural', list).sort((a, b) => b.score - a.score);
    expect(r.map((x) => x.id)).toEqual(['1', '2']);
  });

  it('matches by keyword and by prefix while typing', () => {
    expect(rankArticles('microfin', list).map((x) => x.id)).toEqual(['1']);
    expect(rankArticles('', list)).toEqual([]);
  });

  it('ranks issues and members', () => {
    expect(rankIssues('2024', [{ id: 'j', title: 'Jan-Jun 2024', volume: 16, number: 1, year: '2024' }]).length).toBe(1);
    const m = rankMembers('lee', [
      { id: 'm', name: 'Ann Lee', position: 'Advisory Board Member', affiliation: 'DU' } as BoardMember,
    ]);
    expect(m[0].link).toEqual(['/advisory-board']);
  });

  it('caps each kind', () => {
    const many = Array.from({ length: 10 }, (_, i) => art(String(i), 'rural', ['x']));
    expect(mergeResults([rankArticles('rural', many)], 6).length).toBe(6);
  });
});
