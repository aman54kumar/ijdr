// Mirrors journal-portal/src/app/utils/article-seo.util.ts (keep in sync).
export const JOURNAL_NAME = 'Indian Journal of Development Research';
export const JOURNAL_ISSN = '2249-104X';
export const JOURNAL_PUBLISHER = 'Institute of Development Studies Varanasi';

export function articleUrl(siteUrl: string, id: string): string {
  return `${siteUrl.replace(/\/$/, '')}/article/${encodeURIComponent(id)}`;
}

export interface iArticle {
  id: string;
  issueId: string;
  title: string;
  authors: { name: string; affiliation?: string }[];
  abstract?: string;
  keywords: string[];
  subject?: string;
  pageStart?: number;
  pageEnd?: number;
  doi?: string;
  language?: 'en' | 'hi';
  issueVolume: number;
  issueNumber: number;
  issueYear: string;
}

export interface MetaTag {
  /** Either `name` or `property` is set. */
  name?: string;
  property?: string;
  content: string;
}

export interface ArticleSeo {
  title: string;
  description: string;
  canonical: string;
  tags: MetaTag[];
  jsonLd: Record<string, unknown>;
}

type SeoArticle = Pick<
  iArticle,
  | 'id' | 'issueId' | 'title' | 'authors' | 'abstract' | 'keywords' | 'subject' | 'pageStart' | 'pageEnd'
  | 'doi' | 'language' | 'issueVolume' | 'issueNumber' | 'issueYear'
>;

export function describeArticle(a: SeoArticle): string {
  const abstract = a.abstract?.replace(/\s+/g, ' ').trim();
  if (abstract) {
    return abstract.length > 200 ? `${abstract.slice(0, 197).trimEnd()}...` : abstract;
  }
  const by = a.authors.length ? ` by ${a.authors.map((x) => x.name).join(', ')}` : '';
  return `${a.title}${by}. ${JOURNAL_NAME}, Vol. ${a.issueVolume}, No. ${a.issueNumber} (${a.issueYear}).`;
}

/**
 * Title, description, canonical, Open Graph, Google Scholar (`citation_*`) tags and
 * schema.org JSON-LD for one article. functions/src/article-page.ts mirrors this.
 */
export function buildArticleSeo(a: SeoArticle, siteUrl: string): ArticleSeo {
  const canonical = articleUrl(siteUrl, a.id);
  const site = siteUrl.replace(/\/$/, '');
  const pdfUrl = `${site}/pdf/${encodeURIComponent(a.issueId)}`;
  const description = describeArticle(a);
  const title = `${a.title} | IJDR`;

  const tags: MetaTag[] = [
    { name: 'description', content: description },
    { property: 'og:type', content: 'article' },
    { property: 'og:title', content: a.title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonical },
    { property: 'og:site_name', content: JOURNAL_NAME },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: a.title },
    { name: 'twitter:description', content: description },
    { name: 'citation_title', content: a.title },
    ...a.authors.map((x) => ({ name: 'citation_author', content: x.name })),
    { name: 'citation_publication_date', content: a.issueYear },
    { name: 'citation_journal_title', content: JOURNAL_NAME },
    { name: 'citation_issn', content: JOURNAL_ISSN },
    { name: 'citation_volume', content: String(a.issueVolume) },
    { name: 'citation_issue', content: String(a.issueNumber) },
    { name: 'citation_publisher', content: JOURNAL_PUBLISHER },
    { name: 'citation_abstract_html_url', content: canonical },
    { name: 'citation_pdf_url', content: pdfUrl },
  ];
  if (a.pageStart) tags.push({ name: 'citation_firstpage', content: String(a.pageStart) });
  if (a.pageEnd) tags.push({ name: 'citation_lastpage', content: String(a.pageEnd) });
  if (a.doi) tags.push({ name: 'citation_doi', content: a.doi.replace(/^https?:\/\/doi\.org\//i, '') });
  if (a.language) tags.push({ name: 'citation_language', content: a.language });
  if (a.keywords.length) tags.push({ name: 'citation_keywords', content: a.keywords.join('; ') });

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ScholarlyArticle',
    headline: a.title,
    name: a.title,
    url: canonical,
    mainEntityOfPage: canonical,
    inLanguage: a.language ?? 'en',
    datePublished: a.issueYear,
    author: a.authors.map((x) => ({
      '@type': 'Person',
      name: x.name,
      ...(x.affiliation ? { affiliation: { '@type': 'Organization', name: x.affiliation } } : {}),
    })),
    isPartOf: {
      '@type': 'PublicationIssue',
      issueNumber: String(a.issueNumber),
      datePublished: a.issueYear,
      isPartOf: {
        '@type': 'PublicationVolume',
        volumeNumber: String(a.issueVolume),
        isPartOf: { '@type': 'Periodical', name: JOURNAL_NAME, issn: JOURNAL_ISSN },
      },
    },
    publisher: { '@type': 'Organization', name: JOURNAL_PUBLISHER },
    isAccessibleForFree: true,
    encoding: { '@type': 'MediaObject', contentUrl: pdfUrl, encodingFormat: 'application/pdf' },
  };
  if (a.abstract) jsonLd['abstract'] = a.abstract;
  if (a.keywords.length) jsonLd['keywords'] = a.keywords.join(', ');
  if (a.pageStart) jsonLd['pageStart'] = String(a.pageStart);
  if (a.pageEnd) jsonLd['pageEnd'] = String(a.pageEnd);
  if (a.doi) jsonLd['identifier'] = { '@type': 'PropertyValue', propertyID: 'DOI', value: a.doi };

  return { title, description, canonical, tags, jsonLd };
}
