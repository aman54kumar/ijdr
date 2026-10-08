import { iArticle } from '../type/journals.type';
import { cleanArticleInput, issueDenorm, rankRelated, summarizeArticles } from './article.service';

describe('article.service pure logic', () => {
  it('summarizes counts and status', () => {
    expect(summarizeArticles([])).toEqual({ articleCount: 0, articlesStatus: 'none' });
    expect(summarizeArticles([{ status: 'draft' }])).toEqual({
      articleCount: 1,
      articlesStatus: 'draft',
    });
    expect(summarizeArticles([{ status: 'draft' }, { status: 'published' }])).toEqual({
      articleCount: 2,
      articlesStatus: 'published',
    });
  });

  it('denormalizes issue fields', () => {
    expect(issueDenorm({ title: 'Jan-Jun 2024', volume: 3, number: 1, year: '2024' })).toEqual({
      issueTitle: 'Jan-Jun 2024',
      issueVolume: 3,
      issueNumber: 1,
      issueYear: '2024',
    });
  });

  it('cleans input: trims, drops blanks and undefined', () => {
    const out = cleanArticleInput({
      title: '  A title ',
      authors: [
        { name: ' Ann ', affiliation: ' ', email: 'a@b.co' },
        { name: '   ' },
      ],
      abstract: '  ',
      keywords: [' x ', 'X'],
      pageStart: 4,
      status: 'draft',
    });
    expect(out).toEqual({
      title: 'A title',
      authors: [{ name: 'Ann', email: 'a@b.co' }],
      keywords: ['x'],
      pageStart: 4,
      status: 'draft',
    });
    expect('abstract' in out).toBeFalse();
    expect('pageEnd' in out).toBeFalse();
  });

  it('ranks related articles by shared keywords and subject', () => {
    const mk = (id: string, keywords: string[], subject?: string, year = '2024') =>
      ({ id, keywords, subject, issueYear: year }) as iArticle;
    const self = mk('self', ['Credit', 'Rural'], 'Econ');
    const out = rankRelated(
      self,
      [mk('self', ['credit']), mk('a', ['credit']), mk('b', ['credit', 'rural']), mk('c', ['other']), mk('d', ['x'], 'Econ')],
      3
    );
    expect(out.map((x) => x.id)).toEqual(['b', 'a', 'd']);
  });
});
