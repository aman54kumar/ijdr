import { iArticle } from '../type/journals.type';
import { applyFilters, buildFacets, filtersFromParams } from './article-filter.util';

const mk = (o: Partial<iArticle>): iArticle =>
  ({ id: 'x', issueId: 'i1', issueTitle: 'Issue 1', issueYear: '2024', authors: [], keywords: [], title: 't', ...o }) as iArticle;

const list = [
  mk({ id: 'a', title: 'Rural credit', authors: [{ name: 'Ann Lee' }], keywords: ['Credit'], subject: 'Econ', searchTokens: ['rural', 'credit', 'ann', 'lee'] }),
  mk({ id: 'b', title: 'Urban water', issueId: 'i2', issueTitle: 'Issue 2', issueYear: '2023', authors: [{ name: 'Bo Ray' }], keywords: ['Water'] }),
];

describe('article-filter.util', () => {
  it('reads filters from params, ignoring blanks', () => {
    const p: Record<string, string> = { q: ' rural ', year: '', keyword: 'Credit', junk: 'x' };
    expect(filtersFromParams((k) => p[k] ?? null)).toEqual({ q: 'rural', keyword: 'Credit' });
  });

  it('filters by facet and text', () => {
    expect(applyFilters(list, { year: '2023' }).map((a) => a.id)).toEqual(['b']);
    expect(applyFilters(list, { issue: 'i1' }).map((a) => a.id)).toEqual(['a']);
    expect(applyFilters(list, { keyword: 'credit' }).map((a) => a.id)).toEqual(['a']);
    expect(applyFilters(list, { author: 'Bo Ray' }).map((a) => a.id)).toEqual(['b']);
    expect(applyFilters(list, { subject: 'Econ' }).map((a) => a.id)).toEqual(['a']);
    expect(applyFilters(list, { q: 'rural lee' }).map((a) => a.id)).toEqual(['a']);
    expect(applyFilters(list, { q: 'water' }).map((a) => a.id)).toEqual(['b']);
    expect(applyFilters(list, { q: 'nothing' })).toEqual([]);
  });

  it('builds sorted facets', () => {
    const f = buildFacets(list);
    expect(f.years).toEqual(['2024', '2023']);
    expect(f.keywords).toEqual(['Credit', 'Water']);
    expect(f.issues.map((i) => i.id)).toEqual(['i1', 'i2']);
  });
});
