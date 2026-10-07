import test from 'node:test';
import assert from 'node:assert/strict';
import { dropDuplicatesOfKept, planReplacement, validateIngestResponse } from './validate';

const fixture = {
  totalPdfPages: 60,
  pageOffset: 4,
  articles: [
    {
      title: '  Microfinance and Rural Credit  ',
      authors: [{ name: 'A. K. Sharma', affiliation: 'Delhi University' }, { name: '  ' }],
      abstract: null,
      keywords: ['Credit', ' ', 'Rural'],
      subject: null,
      pageStart: 1,
      pageEnd: 12,
      language: 'en',
      confidence: 1.4,
    },
    { title: '', authors: [], keywords: [] },
    { title: 'Out of range', authors: [{ name: 'X' }], keywords: [], pageStart: 70, pageEnd: 80 },
    { title: 'ग्रामीण विकास', authors: [{ name: 'सुनीता' }], keywords: [], pageStart: 13, language: 'hi' },
  ],
};

test('validates, converts printed pages to PDF pages and drops bad rows', () => {
  const v = validateIngestResponse(fixture);
  assert.equal(v.articles.length, 3);
  const [a, b, c] = v.articles;
  assert.equal(a.title, 'Microfinance and Rural Credit');
  assert.deepEqual(a.authors, [{ name: 'A. K. Sharma', affiliation: 'Delhi University' }]);
  assert.deepEqual(a.keywords, ['Credit', 'Rural']);
  assert.equal(a.abstract, undefined);
  assert.equal(a.pageStart, 5);
  assert.equal(a.pageEnd, 16);
  assert.equal(a.confidence, 1);
  assert.equal(b.pageStart, undefined);
  assert.equal(c.pageStart, 17);
  assert.equal(c.pageEnd, 17);
  assert.ok(v.warnings.some((w) => w.includes('no title')));
  assert.ok(v.warnings.some((w) => w.includes('out of range')));
});

test('rejects unusable payloads', () => {
  assert.throws(() => validateIngestResponse(null));
  assert.throws(() => validateIngestResponse({ articles: 'x' }));
  assert.throws(() => validateIngestResponse({ pageOffset: 0, articles: [] }));
});

test('re-run replaces only untouched AI drafts', () => {
  const plan = planReplacement([
    { id: '1', source: 'ai', status: 'draft', order: 1 },
    { id: '2', source: 'ai', status: 'draft', humanEdited: true, order: 2 },
    { id: '3', source: 'ai', status: 'published', order: 3 },
    { id: '4', source: 'manual', status: 'draft', order: 4 },
  ]);
  assert.deepEqual(plan.deleteIds, ['1']);
  assert.equal(plan.keptCount, 3);
  assert.equal(plan.nextOrder, 5);
});

test('drops drafts duplicating kept titles', () => {
  const r = dropDuplicatesOfKept(
    [{ title: 'Rural Credit!', authors: [], keywords: [] }, { title: 'New', authors: [], keywords: [] }],
    ['rural credit']
  );
  assert.equal(r.skipped, 1);
  assert.equal(r.drafts[0].title, 'New');
});
