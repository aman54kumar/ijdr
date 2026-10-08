import { iArticle } from '../type/journals.type';

export const JOURNAL_NAME = 'Indian Journal of Development Research';
export const JOURNAL_ISSN = '2249-104X';
export const JOURNAL_PUBLISHER = 'Institute of Development Studies Varanasi';

export type CitationFormat = 'apa' | 'mla' | 'chicago' | 'bibtex' | 'ris';

export const CITATION_FORMATS: { id: CitationFormat; label: string; ext: string; mime: string }[] = [
  { id: 'apa', label: 'APA', ext: 'txt', mime: 'text/plain' },
  { id: 'mla', label: 'MLA', ext: 'txt', mime: 'text/plain' },
  { id: 'chicago', label: 'Chicago', ext: 'txt', mime: 'text/plain' },
  { id: 'bibtex', label: 'BibTeX', ext: 'bib', mime: 'application/x-bibtex' },
  { id: 'ris', label: 'RIS', ext: 'ris', mime: 'application/x-research-info-systems' },
];

export interface Citation {
  /** Plain text (what gets copied / downloaded). */
  text: string;
  /** HTML with italics, for on-screen display; only set for the prose styles. */
  html?: string;
}

/** Fields a citation needs: the article plus its issue's volume/number/year. */
export type CitableArticle = Pick<
  iArticle,
  'id' | 'title' | 'authors' | 'issueVolume' | 'issueNumber' | 'issueYear' | 'pageStart' | 'pageEnd' | 'doi' | 'keywords'
>;

const HONORIFICS = /^(dr|prof|professor|mr|mrs|ms|miss|shri|smt|sri)\.?$/i;
const IT_OPEN = '\u0001';
const IT_CLOSE = '\u0002';

interface Name {
  family: string;
  given: string; // may be ''
}

/** "A. K. Sharma" -> {Sharma, A. K.}; "Sharma, A. K." stays as written; honorifics are dropped. */
export function parseName(raw: string): Name {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.includes(',')) {
    const [family, ...rest] = name.split(',');
    return { family: family.trim(), given: rest.join(' ').trim() };
  }
  const parts = name.split(' ').filter((p) => !HONORIFICS.test(p));
  if (parts.length <= 1) {
    return { family: parts[0] ?? name, given: '' };
  }
  const family = parts[parts.length - 1];
  return { family, given: parts.slice(0, -1).join(' ') };
}

function initials(given: string): string {
  return given
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + '.')
    .join(' ');
}

/** The permanent link used in citations and meta tags. */
export function articleUrl(siteUrl: string, id: string): string {
  return `${siteUrl.replace(/\/$/, '')}/article/${encodeURIComponent(id)}`;
}

function doiUrl(doi: string): string {
  return /^https?:\/\//i.test(doi) ? doi : `https://doi.org/${doi.replace(/^doi:\s*/i, '')}`;
}

function link(a: CitableArticle, siteUrl: string): string {
  return a.doi ? doiUrl(a.doi) : articleUrl(siteUrl, a.id);
}

function pages(a: CitableArticle): string {
  if (!a.pageStart) return '';
  return a.pageEnd && a.pageEnd !== a.pageStart ? `${a.pageStart}–${a.pageEnd}` : `${a.pageStart}`;
}

function titleEnd(title: string): string {
  const t = title.trim();
  return /[.?!]$/.test(t) ? t : `${t}.`;
}

function finish(marked: string): Citation {
  const text = marked.replace(/[\u0001\u0002]/g, '');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = esc(marked).replace(/\u0001/g, '<i>').replace(/\u0002/g, '</i>');
  return { text, html };
}

function apa(a: CitableArticle, siteUrl: string): Citation {
  const names = a.authors.map((x) => {
    const n = parseName(x.name);
    return n.given ? `${n.family}, ${initials(n.given)}` : n.family;
  });
  let authors = '';
  if (names.length === 1) authors = names[0];
  else if (names.length === 2) authors = `${names[0]}, & ${names[1]}`;
  else if (names.length > 2) authors = `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
  const lead = authors ? `${authors} ` : '';
  const vol = `${IT_OPEN}${a.issueVolume}${IT_CLOSE}(${a.issueNumber})`;
  const pg = pages(a) ? `, ${pages(a)}` : '';
  return finish(
    `${lead}(${a.issueYear}). ${titleEnd(a.title)} ${IT_OPEN}${JOURNAL_NAME}${IT_CLOSE}, ${vol}${pg}. ${link(a, siteUrl)}`
  );
}

function mlaNames(a: CitableArticle): string {
  const n = a.authors.map((x) => parseName(x.name));
  const full = (x: Name) => (x.given ? `${x.given} ${x.family}` : x.family);
  const first = n[0] ? (n[0].given ? `${n[0].family}, ${n[0].given}` : n[0].family) : '';
  if (n.length === 0) return '';
  if (n.length === 1) return first;
  if (n.length === 2) return `${first}, and ${full(n[1])}`;
  return `${first}, et al`;
}

function mla(a: CitableArticle, siteUrl: string): Citation {
  const au = mlaNames(a);
  const lead = au ? `${au}${au.endsWith('.') ? '' : '.'} ` : '';
  const pg = pages(a) ? `, pp. ${pages(a)}` : '';
  return finish(
    `${lead}“${titleEnd(a.title)}” ${IT_OPEN}${JOURNAL_NAME}${IT_CLOSE}, vol. ${a.issueVolume}, no. ${a.issueNumber}, ${a.issueYear}${pg}, ${link(a, siteUrl)}.`
  );
}

function chicago(a: CitableArticle, siteUrl: string): Citation {
  const n = a.authors.map((x) => parseName(x.name));
  const full = (x: Name) => (x.given ? `${x.given} ${x.family}` : x.family);
  const first = (x: Name) => (x.given ? `${x.family}, ${x.given}` : x.family);
  let au = '';
  if (n.length === 1) au = first(n[0]);
  else if (n.length === 2) au = `${first(n[0])}, and ${full(n[1])}`;
  else if (n.length > 2) {
    au = `${first(n[0])}, ${n.slice(1, -1).map(full).join(', ')}, and ${full(n[n.length - 1])}`;
  }
  const lead = au ? `${au}${au.endsWith('.') ? '' : '.'} ` : '';
  const pg = pages(a) ? `: ${pages(a)}` : '';
  return finish(
    `${lead}${a.issueYear}. “${titleEnd(a.title)}” ${IT_OPEN}${JOURNAL_NAME}${IT_CLOSE} ${a.issueVolume} (${a.issueNumber})${pg}. ${link(a, siteUrl)}.`
  );
}

function bibKey(a: CitableArticle): string {
  const fam = a.authors[0] ? parseName(a.authors[0].name).family : 'ijdr';
  const word = (a.title.match(/[\p{L}\p{N}]{4,}/u) ?? ['article'])[0];
  return `${fam}${a.issueYear}${word}`.normalize('NFKD').replace(/[^A-Za-z0-9]/g, '');
}

function bibtex(a: CitableArticle, siteUrl: string): Citation {
  const esc = (s: string) => s.replace(/([&%$#_{}])/g, '\\$1');
  const au = a.authors.map((x) => {
    const n = parseName(x.name);
    return n.given ? `${n.family}, ${n.given}` : n.family;
  });
  const lines = [
    `  title = {${esc(a.title)}}`,
    ...(au.length ? [`  author = {${esc(au.join(' and '))}}`] : []),
    `  journal = {${JOURNAL_NAME}}`,
    `  year = {${a.issueYear}}`,
    `  volume = {${a.issueVolume}}`,
    `  number = {${a.issueNumber}}`,
    ...(pages(a) ? [`  pages = {${pages(a).replace('–', '--')}}`] : []),
    ...(a.doi ? [`  doi = {${doiUrl(a.doi).replace(/^https:\/\/doi\.org\//, '')}}`] : []),
    `  issn = {${JOURNAL_ISSN}}`,
    `  url = {${articleUrl(siteUrl, a.id)}}`,
  ];
  return { text: `@article{${bibKey(a)},\n${lines.join(',\n')}\n}` };
}

function ris(a: CitableArticle, siteUrl: string): Citation {
  const lines = [
    'TY  - JOUR',
    `TI  - ${a.title}`,
    ...a.authors.map((x) => {
      const n = parseName(x.name);
      return `AU  - ${n.given ? `${n.family}, ${n.given}` : n.family}`;
    }),
    `T2  - ${JOURNAL_NAME}`,
    `PY  - ${a.issueYear}`,
    `VL  - ${a.issueVolume}`,
    `IS  - ${a.issueNumber}`,
    ...(a.pageStart ? [`SP  - ${a.pageStart}`] : []),
    ...(a.pageEnd ? [`EP  - ${a.pageEnd}`] : []),
    ...(a.doi ? [`DO  - ${doiUrl(a.doi).replace(/^https:\/\/doi\.org\//, '')}`] : []),
    ...a.keywords.map((k) => `KW  - ${k}`),
    `SN  - ${JOURNAL_ISSN}`,
    `PB  - ${JOURNAL_PUBLISHER}`,
    `UR  - ${articleUrl(siteUrl, a.id)}`,
    'ER  - ',
  ];
  return { text: lines.join('\n') };
}

export function formatCitation(format: CitationFormat, a: CitableArticle, siteUrl: string): Citation {
  switch (format) {
    case 'apa': return apa(a, siteUrl);
    case 'mla': return mla(a, siteUrl);
    case 'chicago': return chicago(a, siteUrl);
    case 'bibtex': return bibtex(a, siteUrl);
    case 'ris': return ris(a, siteUrl);
  }
}
