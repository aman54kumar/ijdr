import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanQuestion, cosine, dayKey, embeddingText, parseAiSettings, topK, validateChat, validateSummary, visitorKey,
} from './pure';

test('kill switches default to off', () => {
  assert.deepEqual(parseAiSettings(undefined), { summaries: false, translation: false, chat: false, semanticSearch: false });
  assert.deepEqual(parseAiSettings({ chat: true, summaries: 'yes' }), { summaries: false, translation: false, chat: true, semanticSearch: false });
});

test('day and visitor keys', () => {
  assert.equal(dayKey(new Date('2026-10-07T23:59:59Z')), '2026-10-07');
  const a = visitorKey('1.2.3.4', 's');
  assert.equal(a, visitorKey('1.2.3.4', 's'));
  assert.notEqual(a, visitorKey('1.2.3.5', 's'));
  assert.ok(!a.includes('1.2.3.4'));
});

test('cleans questions', () => {
  assert.equal(cleanQuestion('  What   is\n the finding? '), 'What is the finding?');
  assert.equal(cleanQuestion('hi'), null);
  assert.equal(cleanQuestion(42), null);
  assert.equal(cleanQuestion('x'.repeat(1000))!.length, 400);
});

test('chat answers must cite valid pages and are mapped to file pages', () => {
  const ok = validateChat({ answerable: true, answer: 'Yes.', pages: [2, 2, 9, 0, 1.5, 3] }, 10, 4);
  assert.deepEqual(ok, { answerable: true, answer: 'Yes.', pages: [11, 12] });
  const noCite = validateChat({ answerable: true, answer: 'Yes.', pages: [99] }, 10, 4);
  assert.equal(noCite.answerable, false);
  assert.deepEqual(noCite.pages, []);
  const refused = validateChat({ answerable: false, answer: 'Not covered.', pages: [1] }, 10, 4);
  assert.deepEqual(refused, { answerable: false, answer: 'Not covered.', pages: [] });
  assert.equal(validateChat(null, 1, 1).answerable, false);
});

test('summary validation', () => {
  assert.deepEqual(validateSummary({ text: ' Hi ', keyPoints: ['a', '', 3] }), { text: 'Hi', keyPoints: ['a'] });
  assert.throws(() => validateSummary({ text: '', keyPoints: [] }));
});

test('similarity ranking', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([], [1]), 0);
  const items = [
    { id: 'a', vector: [1, 0] },
    { id: 'b', vector: [0.9, 0.1] },
    { id: 'c', vector: [0, 1] },
    { id: 'self', vector: [1, 0] },
  ];
  assert.deepEqual(topK([1, 0], items, 5, 'self').map((x) => x.id), ['a', 'b']);
});

test('embedding text', () => {
  assert.equal(embeddingText({ title: 'T', abstract: 'A', keywords: ['k1', 'k2'] }), 'T\n\nA\n\nk1, k2');
  assert.equal(embeddingText({ title: 'T' }), 'T');
});
