import test from 'node:test';
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { buildDailyStats, viewDeltas, yesterday } from './stats';
import { buildOpsSummary, tokenMatches } from './summary';
import { safeDisplayName, validateFile, validateSubmissionFields } from './submission';
import { buildContactEmail, buildSubmissionEmail, oneLine, parseEmailList, resolveNotifySettings, sendEmail } from './email';

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
  const s = buildSubmissionEmail({ id: 'S1', name: 'Ann', email: 'a@b.co', affiliation: 'DU', title: 'T\r\nBcc: x@y.z', keywords: ['k'], files: [{ name: 'p.pdf', size: 2048 }] }, 'IJDR <f@x.y>', ['to@x.y', 'two@x.y'], 'https://ijdrpub.in/admin');
  assert.ok(!/[\r\n]/.test(s.subject));
  assert.ok(s.text.includes('p.pdf (2 KB)'));
  assert.equal(buildContactEmail({ name: 'N', email: 'e@x.y', message: 'm' }, 'f', ['t@x.y'], 'u').replyTo, 'e@x.y');
  assert.equal(oneLine('a\nb'), 'a b');
  assert.equal(await sendEmail('', s), false);
  let sent: any;
  const ok = await sendEmail('key', s, (async (_u: any, init: any) => { sent = JSON.parse(init.body); return { ok: true } as Response; }) as any);
  assert.ok(ok);
  assert.deepEqual(sent.to, ['to@x.y', 'two@x.y']);
  assert.equal(await sendEmail('key', { ...s, to: [] }), false);
  const fail = await sendEmail('key', s, (async () => { throw new Error('net'); }) as any);
  assert.equal(fail, false);
});

test('recipient lists are parsed, de-duplicated and capped', () => {
  assert.deepEqual(parseEmailList('A@x.co, b@x.co;  a@x.co\nbad, c@@x.co'), ['a@x.co', 'b@x.co']);
  assert.deepEqual(parseEmailList(['one@x.co', 5, 'two@x.co']), ['one@x.co', 'two@x.co']);
  assert.deepEqual(parseEmailList(undefined), []);
  assert.equal(parseEmailList('a@x.co b@x.co c@x.co d@x.co e@x.co f@x.co').length, 5);
});

test('notification settings: saved list wins, env default is the fallback', () => {
  assert.deepEqual(resolveNotifySettings(undefined, 'me@x.co, you@x.co'), { emails: ['me@x.co', 'you@x.co'], onSubmission: true, onContact: true });
  assert.deepEqual(resolveNotifySettings({ emails: ['new@x.co'], onContact: false }, 'me@x.co'), { emails: ['new@x.co'], onSubmission: true, onContact: false });
  // an admin who saved an empty list has switched notifications off, not fallen back to the default
  assert.deepEqual(resolveNotifySettings({ emails: [] }, 'me@x.co').emails, []);
  assert.deepEqual(resolveNotifySettings({ emails: 'x' }, 'me@x.co').emails, ['me@x.co']);
});

const DAY_MS = 24 * 3600 * 1000;
const snap = (date: string, issueViews: number, a1: number, a2 = 0) =>
  buildDailyStats({
    date,
    journals: [{ id: 'j1', title: 'Issue 1', viewCount: issueViews }],
    articles: [{ id: 'a1', title: 'Alpha', viewCount: a1, status: 'published' }, { id: 'a2', title: 'Beta', viewCount: a2, status: 'published' }],
    contacts: 0, submissions: 0, ai: {},
  });

test('ops summary: traffic series, top lists, queues and AI usage; no personal data', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  // 16 daily snapshots: issue views +2/day, article a1 +3/day for the first 8 days then +9/day.
  const days = Array.from({ length: 16 }, (_, i) => {
    const date = new Date(Date.parse('2026-10-05T00:00:00Z') + i * DAY_MS).toISOString().slice(0, 10);
    const a1 = i <= 7 ? i * 3 : 21 + (i - 7) * 9;
    return snap(date, i * 2, a1);
  });
  const s = buildOpsSummary({
    now,
    days,
    journals: [{ id: 'j1', title: 'Issue 1', viewCount: 30 }],
    articles: [{ id: 'a1', title: 'Alpha', viewCount: 84, status: 'published' }, { id: 'a2', title: 'Beta', viewCount: 0, status: 'published' }, { id: 'a3', title: 'Draft', status: 'draft' }],
    submissions: [{ status: 'received', createdAtMs: now - 5 * DAY_MS }, { status: 'accepted', createdAtMs: now - 40 * DAY_MS }, { createdAtMs: now - 1 * DAY_MS }],
    contacts: [{ read: false, createdAtMs: now - 3 * DAY_MS }, { read: true, createdAtMs: now - 30 * DAY_MS }],
    ingestJobs: [{ state: 'running' }, { state: 'error' }, { state: 'done' }],
    ai: { chat: 50, updatedAt: 'x' },
    aiLimits: { chat: 200, summaries: 40 },
  });
  assert.deepEqual(s.catalogue, { issues: 1, published: 2, drafts: 1, neverOpened: 1, issueViews: 30, articleViews: 84 });
  assert.equal(s.traffic.series.length, 15);
  assert.equal(s.traffic.lastRollup, '2026-10-20');
  assert.equal(s.traffic.rollupAgeDays, 0);
  assert.equal(s.traffic.series[0].issues, 2);
  assert.equal(s.traffic.last7, 7 * (2 + 9));
  assert.equal(s.traffic.prev7, 2 * 7 + 6 * 3 + 9); // a1: +3 for six days, then +9
  assert.ok((s.traffic.changePct ?? 0) > 0);
  assert.deepEqual(s.top.articles7d.map((a) => a.id), ['a1']);
  assert.equal(s.top.articlesAll[0].title, 'Alpha');
  assert.deepEqual(s.submissions.byStatus, { received: 2, accepted: 1 });
  assert.equal(s.submissions.waiting, 2);
  assert.equal(s.submissions.oldestWaitingDays, 5);
  assert.equal(s.submissions.new7d, 2);
  assert.deepEqual(s.inbox, { total: 2, unread: 1, oldestUnreadDays: 3, new7d: 1 });
  assert.deepEqual(s.ingest, { running: 1, failed: 1 });
  assert.deepEqual(s.ai, { chat: { used: 50, limit: 200 }, summaries: { used: 0, limit: 40 } });
  assert.ok(!/@/.test(JSON.stringify(s)));
});

test('ops summary copes with an empty project', () => {
  const s = buildOpsSummary({ now: Date.now(), days: [], journals: [], articles: [], submissions: [], contacts: [], ingestJobs: [], ai: {}, aiLimits: {} });
  assert.equal(s.traffic.lastRollup, null);
  assert.equal(s.traffic.changePct, null);
  assert.equal(s.submissions.oldestWaitingDays, null);
  assert.deepEqual(s.top.articles7d, []);
});

test('ops token check is strict', () => {
  const token = 'x'.repeat(40);
  assert.ok(tokenMatches(`Bearer ${token}`, token, timingSafeEqual));
  assert.ok(!tokenMatches(`Bearer ${token}y`, token, timingSafeEqual));
  assert.ok(!tokenMatches(token, token, timingSafeEqual));
  assert.ok(!tokenMatches(undefined, token, timingSafeEqual));
  assert.ok(!tokenMatches('Bearer short', 'short', timingSafeEqual)); // an unset or weak secret never matches
  assert.ok(!tokenMatches('Bearer ', '', timingSafeEqual));
});
