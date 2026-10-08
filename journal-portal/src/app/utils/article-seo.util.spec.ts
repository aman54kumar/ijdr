import { buildArticleSeo, describeArticle } from './article-seo.util';

const a = {
  id: 'abc',
  issueId: 'iss1',
  title: 'Rural Credit',
  authors: [{ name: 'A. K. Sharma', affiliation: 'DU' }, { name: 'Priya Nair' }],
  abstract: undefined as string | undefined,
  keywords: ['credit', 'rural'],
  pageStart: 5,
  pageEnd: 16,
  language: 'en' as const,
  issueVolume: 16,
  issueNumber: 1,
  issueYear: '2024',
};

describe('article-seo.util', () => {
  const seo = buildArticleSeo(a, 'https://ijdrpub.in/');
  const get = (n: string) => seo.tags.filter((t) => t.name === n).map((t) => t.content);

  it('emits Google Scholar tags', () => {
    expect(get('citation_title')).toEqual(['Rural Credit']);
    expect(get('citation_author')).toEqual(['A. K. Sharma', 'Priya Nair']);
    expect(get('citation_publication_date')).toEqual(['2024']);
    expect(get('citation_journal_title')).toEqual(['Indian Journal of Development Research']);
    expect(get('citation_volume')).toEqual(['16']);
    expect(get('citation_issue')).toEqual(['1']);
    expect(get('citation_firstpage')).toEqual(['5']);
    expect(get('citation_issn')).toEqual(['2249-104X']);
    expect(get('citation_pdf_url')).toEqual(['https://ijdrpub.in/pdf/iss1']);
  });

  it('sets canonical, title and JSON-LD', () => {
    expect(seo.canonical).toBe('https://ijdrpub.in/article/abc');
    expect(seo.title).toBe('Rural Credit | IJDR');
    expect(seo.jsonLd['@type']).toBe('ScholarlyArticle');
    expect((seo.jsonLd['author'] as unknown[]).length).toBe(2);
  });

  it('falls back to a generated description and truncates long abstracts', () => {
    expect(describeArticle(a)).toContain('by A. K. Sharma, Priya Nair');
    expect(describeArticle({ ...a, abstract: 'x'.repeat(500) }).length).toBeLessThanOrEqual(200);
  });
});
