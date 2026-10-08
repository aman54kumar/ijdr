import { articleUrl, CitableArticle, formatCitation, parseName } from './citation.util';

const SITE = 'https://ijdrpub.in';
const base: CitableArticle = {
  id: 'abc123',
  title: 'Microfinance and Rural Credit in Eastern Uttar Pradesh',
  authors: [{ name: 'A. K. Sharma' }, { name: 'Dr. Priya Nair' }],
  issueVolume: 16,
  issueNumber: 1,
  issueYear: '2024',
  pageStart: 5,
  pageEnd: 16,
  keywords: ['credit', 'rural'],
};

describe('citation.util', () => {
  it('parses names', () => {
    expect(parseName('A. K. Sharma')).toEqual({ family: 'Sharma', given: 'A. K.' });
    expect(parseName('Dr. Priya Nair')).toEqual({ family: 'Nair', given: 'Priya' });
    expect(parseName('Sharma, Anil K.')).toEqual({ family: 'Sharma', given: 'Anil K.' });
    expect(parseName('Madonna')).toEqual({ family: 'Madonna', given: '' });
  });

  it('builds the article URL', () => {
    expect(articleUrl(`${SITE}/`, 'a b')).toBe('https://ijdrpub.in/article/a%20b');
  });

  it('formats APA', () => {
    const c = formatCitation('apa', base, SITE);
    expect(c.text).toBe(
      'Sharma, A. K., & Nair, P. (2024). Microfinance and Rural Credit in Eastern Uttar Pradesh. Indian Journal of Development Research, 16(1), 5–16. https://ijdrpub.in/article/abc123'
    );
    expect(c.html).toContain('<i>Indian Journal of Development Research</i>');
    expect(c.html).toContain('<i>16</i>(1)');
  });

  it('formats MLA, with et al. for three or more authors', () => {
    expect(formatCitation('mla', base, SITE).text).toBe(
      'Sharma, A. K., and Priya Nair. “Microfinance and Rural Credit in Eastern Uttar Pradesh.” Indian Journal of Development Research, vol. 16, no. 1, 2024, pp. 5–16, https://ijdrpub.in/article/abc123.'
    );
    const three = { ...base, authors: [{ name: 'A B' }, { name: 'C D' }, { name: 'E F' }] };
    expect(formatCitation('mla', three, SITE).text.startsWith('B, A, et al. ')).toBeTrue();
  });

  it('formats Chicago', () => {
    expect(formatCitation('chicago', base, SITE).text).toBe(
      'Sharma, A. K., and Priya Nair. 2024. “Microfinance and Rural Credit in Eastern Uttar Pradesh.” Indian Journal of Development Research 16 (1): 5–16. https://ijdrpub.in/article/abc123.'
    );
  });

  it('uses the DOI link when present', () => {
    const c = formatCitation('apa', { ...base, doi: '10.1234/ijdr.5' }, SITE);
    expect(c.text.endsWith('https://doi.org/10.1234/ijdr.5')).toBeTrue();
  });

  it('formats BibTeX and RIS', () => {
    const bib = formatCitation('bibtex', base, SITE).text;
    expect(bib).toContain('@article{Sharma2024Microfinance,');
    expect(bib).toContain('author = {Sharma, A. K. and Nair, Priya}');
    expect(bib).toContain('pages = {5--16}');
    const ris = formatCitation('ris', base, SITE).text.split('\n');
    expect(ris[0]).toBe('TY  - JOUR');
    expect(ris).toContain('AU  - Nair, Priya');
    expect(ris).toContain('SP  - 5');
    expect(ris[ris.length - 1]).toBe('ER  - ');
  });

  it('escapes HTML in the on-screen version only', () => {
    const c = formatCitation('apa', { ...base, title: 'R&D <b>' }, SITE);
    expect(c.html).toContain('R&amp;D &lt;b&gt;.');
    expect(c.text).toContain('R&D <b>.');
  });

  it('omits pages and authors cleanly', () => {
    const c = formatCitation('apa', { ...base, authors: [], pageStart: undefined, pageEnd: undefined }, SITE);
    expect(c.text.startsWith('(2024). ')).toBeTrue();
    expect(c.text).not.toContain(', ,');
  });
});
