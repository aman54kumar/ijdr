import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyStats, viewDeltas, yesterday } from './stats';
import { safeDisplayName, validateFile, validateSubmissionFields } from './submission';
import { buildContactEmail, buildSubmissionEmail, oneLine, sendEmail } from './email';

test('daily stats and deltas', () => {
  const d1 = buildDailyStats({
    date: '2026-10-06',
    journals: [{ id: 'j1', title: 'J1', viewCount: 10 }],
    articles: [{ id: 'a1', title: 'A1', viewCount: 4, status: 'published' }, { id: 'a2', title: 'A2', viewCount: 9, status: 'draft' }],
    contacts: 3, submissions: 1, ai: { chat: 5, updatedAt: 'x' },
  });
  assert.equal(d1.totals.issueViews, 10);
  assert.equal(d1.totals.articleViews, 4);
  assert.equal(d1.totals.articlesPublished, 1);
  assert.deepEqual(d1.ai, { chat: 5 });
  const d2 = buildDailyStats({
    date: '2026-10-07',
    journals: [{ id: 'j1', title: 'J1', viewCount: 15 }, { id: 'j2', title: 'J2', viewCount: 2 }],
    articles: [{ id: 'a1', title: 'A1', viewCount: 3, status: 'published' }],
    contacts: 3, submissions: 2, ai: {},
  });
  const d = viewDeltas(d1, d2);
  assert.deepEqual(d.issues, { j1: 5, j2: 2 });
  assert.deepEqual(d.articles, { a1: 0 }); // counters never go negative
  assert.equal(d.issueViews, 7);
  assert.equal(viewDeltas(undefined, d2).issueViews, 17);
  assert.equal(yesterday(new Date('2026-10-07T01:00:00Z')), '2026-10-06');
});

const good = {
  name: ' Ann Lee ', email: 'ann@uni.edu', affiliation: 'DU', title: 'Rural credit in Bihar',
  abstract: 'x'.repeat(120), keywords: 'credit, rural; Bihar', consent: 'true',
};

test('submission fields', () => {
  const r = validateSubmissionFields(good);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.name, 'Ann Lee');
    assert.deepEqual(r.value.keywords, ['credit', 'rural', 'Bihar']);
  }
  const bad = validateSubmissionFields({ ...good, email: 'nope', abstract: 'short', consent: 'false', keywords: 'one' });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.equal(bad.errors.length, 4);
});

test('file validation checks name, size and real signature', () => {
  const pdf = Buffer.from('%PDF-1.7 rest');
  const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const doc = Buffer.from('d0cf11e0a1b11ae1', 'hex');
  assert.ok(validateFile('manuscript', 'paper.pdf', pdf).ok);
  assert.ok(validateFile('manuscript', 'Paper.DOCX', docx).ok);
  assert.ok(validateFile('coverLetter', 'c.doc', doc).ok);
  assert.ok(!validateFile('manuscript', 'paper.exe', pdf).ok);
  assert.ok(!validateFile('manuscript', 'fake.pdf', Buffer.from('MZ not a pdf')).ok);
  assert.ok(!validateFile('manuscript', 'paper.pdf', Buffer.alloc(0)).ok);
  assert.ok(!validateFile('coverLetter', 'big.pdf', Buffer.concat([pdf, Buffer.alloc(6 * 1048576)])).ok);
  assert.equal(safeDisplayName('../../etc/passwd\n.pdf'), '.._.._etc_passwd_.pdf');
});

test('emails are plain text with safe headers, and sending is best effort', async () => {
  const s = buildSubmissionEmail({ id: 'S1', name: 'Ann', email: 'a@b.co', affiliation: 'DU', title: 'T\r\nBcc: x@y.z', keywords: ['k'], files: [{ name: 'p.pdf', size: 2048 }] }, 'IJDR <f@x.y>', 'to@x.y', 'https://ijdrpub.in/admin');
  assert.ok(!/[\r\n]/.test(s.subject));
  assert.ok(s.text.includes('p.pdf (2 KB)'));
  assert.equal(buildContactEmail({ name: 'N', email: 'e@x.y', message: 'm' }, 'f', 't', 'u').replyTo, 'e@x.y');
  assert.equal(oneLine('a\nb'), 'a b');
  assert.equal(await sendEmail('', s), false);
  let sent: any;
  const ok = await sendEmail('key', s, (async (_u: any, init: any) => { sent = JSON.parse(init.body); return { ok: true } as Response; }) as any);
  assert.ok(ok);
  assert.deepEqual(sent.to, ['to@x.y']);
  const fail = await sendEmail('key', s, (async () => { throw new Error('net'); }) as any);
  assert.equal(fail, false);
});
