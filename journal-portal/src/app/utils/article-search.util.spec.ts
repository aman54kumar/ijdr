import { buildSearchTokens, normalizeKeywords, tokenize } from './article-search.util';

describe('article-search.util', () => {
  it('lowercases, splits, drops stopwords and duplicates', () => {
    expect(tokenize('The Rise of Rural-Credit, and the RISE of banks')).toEqual([
      'rise', 'rural', 'credit', 'banks',
    ]);
  });

  it('folds Latin accents but keeps Devanagari intact', () => {
    expect(tokenize('Étude économique')).toEqual(['etude', 'economique']);
    expect(tokenize('ग्रामीण विकास')).toEqual(['ग्रामीण', 'विकास']);
  });

  it('handles empty input', () => {
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize('  ')).toEqual([]);
  });

  it('builds tokens from title, authors and keywords', () => {
    const tokens = buildSearchTokens({
      title: 'Microfinance in India',
      authors: [{ name: 'A. K. Sharma' }, { name: 'Priya Nair' }],
      keywords: ['Self Help Groups', 'microfinance'],
    });
    expect(tokens).toEqual(
      jasmine.arrayContaining(['microfinance', 'india', 'sharma', 'priya', 'nair', 'self', 'help', 'groups'])
    );
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('normalizes keywords case-insensitively', () => {
    expect(normalizeKeywords([' Credit ', 'credit', '', 'Rural  Credit'])).toEqual([
      'Credit', 'Rural Credit',
    ]);
  });
});
