"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const stats_1 = require("./stats");
const summary_1 = require("./summary");
const submission_1 = require("./submission");
const email_1 = require("./email");
(0, node_test_1.default)('daily stats and deltas', () => {
    const d1 = (0, stats_1.buildDailyStats)({
        date: '2026-10-06',
        journals: [{ id: 'j1', title: 'J1', viewCount: 10 }],
        articles: [{ id: 'a1', title: 'A1', viewCount: 4, status: 'published' }, { id: 'a2', title: 'A2', viewCount: 9, status: 'draft' }],
        contacts: 3, submissions: 1, ai: { chat: 5, updatedAt: 'x' },
    });
    strict_1.default.equal(d1.totals.issueViews, 10);
    strict_1.default.equal(d1.totals.articleViews, 4);
    strict_1.default.equal(d1.totals.articlesPublished, 1);
    strict_1.default.deepEqual(d1.ai, { chat: 5 });
    const d2 = (0, stats_1.buildDailyStats)({
        date: '2026-10-07',
        journals: [{ id: 'j1', title: 'J1', viewCount: 15 }, { id: 'j2', title: 'J2', viewCount: 2 }],
        articles: [{ id: 'a1', title: 'A1', viewCount: 3, status: 'published' }],
        contacts: 3, submissions: 2, ai: {},
    });
    const d = (0, stats_1.viewDeltas)(d1, d2);
    strict_1.default.deepEqual(d.issues, { j1: 5, j2: 2 });
    strict_1.default.deepEqual(d.articles, { a1: 0 }); // counters never go negative
    strict_1.default.equal(d.issueViews, 7);
    strict_1.default.equal((0, stats_1.viewDeltas)(undefined, d2).issueViews, 17);
    strict_1.default.equal((0, stats_1.yesterday)(new Date('2026-10-07T01:00:00Z')), '2026-10-06');
});
const good = {
    name: ' Ann Lee ', email: 'ann@uni.edu', affiliation: 'DU', title: 'Rural credit in Bihar',
    abstract: 'x'.repeat(120), keywords: 'credit, rural; Bihar', consent: 'true',
};
(0, node_test_1.default)('submission fields', () => {
    const r = (0, submission_1.validateSubmissionFields)(good);
    strict_1.default.ok(r.ok);
    if (r.ok) {
        strict_1.default.equal(r.value.name, 'Ann Lee');
        strict_1.default.deepEqual(r.value.keywords, ['credit', 'rural', 'Bihar']);
    }
    const bad = (0, submission_1.validateSubmissionFields)({ ...good, email: 'nope', abstract: 'short', consent: 'false', keywords: 'one' });
    strict_1.default.ok(!bad.ok);
    if (!bad.ok)
        strict_1.default.equal(bad.errors.length, 4);
});
(0, node_test_1.default)('file validation checks name, size and real signature', () => {
    const pdf = Buffer.from('%PDF-1.7 rest');
    const docx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const doc = Buffer.from('d0cf11e0a1b11ae1', 'hex');
    strict_1.default.ok((0, submission_1.validateFile)('manuscript', 'paper.pdf', pdf).ok);
    strict_1.default.ok((0, submission_1.validateFile)('manuscript', 'Paper.DOCX', docx).ok);
    strict_1.default.ok((0, submission_1.validateFile)('coverLetter', 'c.doc', doc).ok);
    strict_1.default.ok(!(0, submission_1.validateFile)('manuscript', 'paper.exe', pdf).ok);
    strict_1.default.ok(!(0, submission_1.validateFile)('manuscript', 'fake.pdf', Buffer.from('MZ not a pdf')).ok);
    strict_1.default.ok(!(0, submission_1.validateFile)('manuscript', 'paper.pdf', Buffer.alloc(0)).ok);
    strict_1.default.ok(!(0, submission_1.validateFile)('coverLetter', 'big.pdf', Buffer.concat([pdf, Buffer.alloc(6 * 1048576)])).ok);
    strict_1.default.equal((0, submission_1.safeDisplayName)('../../etc/passwd\n.pdf'), '.._.._etc_passwd_.pdf');
});
(0, node_test_1.default)('emails are plain text with safe headers, and sending is best effort', async () => {
    const s = (0, email_1.buildSubmissionEmail)({ id: 'S1', name: 'Ann', email: 'a@b.co', affiliation: 'DU', title: 'T\r\nBcc: x@y.z', keywords: ['k'], files: [{ name: 'p.pdf', size: 2048 }] }, 'IJDR <f@x.y>', ['to@x.y', 'two@x.y'], 'https://ijdrpub.in/admin');
    strict_1.default.ok(!/[\r\n]/.test(s.subject));
    strict_1.default.ok(s.text.includes('p.pdf (2 KB)'));
    strict_1.default.equal((0, email_1.buildContactEmail)({ name: 'N', email: 'e@x.y', message: 'm' }, 'f', ['t@x.y'], 'u').replyTo, 'e@x.y');
    strict_1.default.equal((0, email_1.oneLine)('a\nb'), 'a b');
    strict_1.default.equal(await (0, email_1.sendEmail)('', s), false);
    let sent;
    const ok = await (0, email_1.sendEmail)('key', s, (async (_u, init) => { sent = JSON.parse(init.body); return { ok: true }; }));
    strict_1.default.ok(ok);
    strict_1.default.deepEqual(sent.to, ['to@x.y', 'two@x.y']);
    strict_1.default.equal(await (0, email_1.sendEmail)('key', { ...s, to: [] }), false);
    const fail = await (0, email_1.sendEmail)('key', s, (async () => { throw new Error('net'); }));
    strict_1.default.equal(fail, false);
});
(0, node_test_1.default)('recipient lists are parsed, de-duplicated and capped', () => {
    strict_1.default.deepEqual((0, email_1.parseEmailList)('A@x.co, b@x.co;  a@x.co\nbad, c@@x.co'), ['a@x.co', 'b@x.co']);
    strict_1.default.deepEqual((0, email_1.parseEmailList)(['one@x.co', 5, 'two@x.co']), ['one@x.co', 'two@x.co']);
    strict_1.default.deepEqual((0, email_1.parseEmailList)(undefined), []);
    strict_1.default.equal((0, email_1.parseEmailList)('a@x.co b@x.co c@x.co d@x.co e@x.co f@x.co').length, 5);
});
(0, node_test_1.default)('notification settings: saved list wins, env default is the fallback', () => {
    strict_1.default.deepEqual((0, email_1.resolveNotifySettings)(undefined, 'me@x.co, you@x.co'), { emails: ['me@x.co', 'you@x.co'], onSubmission: true, onContact: true });
    strict_1.default.deepEqual((0, email_1.resolveNotifySettings)({ emails: ['new@x.co'], onContact: false }, 'me@x.co'), { emails: ['new@x.co'], onSubmission: true, onContact: false });
    // an admin who saved an empty list has switched notifications off, not fallen back to the default
    strict_1.default.deepEqual((0, email_1.resolveNotifySettings)({ emails: [] }, 'me@x.co').emails, []);
    strict_1.default.deepEqual((0, email_1.resolveNotifySettings)({ emails: 'x' }, 'me@x.co').emails, ['me@x.co']);
});
const DAY_MS = 24 * 3600 * 1000;
const snap = (date, issueViews, a1, a2 = 0) => (0, stats_1.buildDailyStats)({
    date,
    journals: [{ id: 'j1', title: 'Issue 1', viewCount: issueViews }],
    articles: [{ id: 'a1', title: 'Alpha', viewCount: a1, status: 'published' }, { id: 'a2', title: 'Beta', viewCount: a2, status: 'published' }],
    contacts: 0, submissions: 0, ai: {},
});
(0, node_test_1.default)('ops summary: traffic series, top lists, queues and AI usage; no personal data', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    // 16 daily snapshots: issue views +2/day, article a1 +3/day for the first 8 days then +9/day.
    const days = Array.from({ length: 16 }, (_, i) => {
        const date = new Date(Date.parse('2026-10-05T00:00:00Z') + i * DAY_MS).toISOString().slice(0, 10);
        const a1 = i <= 7 ? i * 3 : 21 + (i - 7) * 9;
        return snap(date, i * 2, a1);
    });
    const s = (0, summary_1.buildOpsSummary)({
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
    strict_1.default.deepEqual(s.catalogue, { issues: 1, published: 2, drafts: 1, neverOpened: 1, issueViews: 30, articleViews: 84 });
    strict_1.default.equal(s.traffic.series.length, 15);
    strict_1.default.equal(s.traffic.lastRollup, '2026-10-20');
    strict_1.default.equal(s.traffic.rollupAgeDays, 0);
    strict_1.default.equal(s.traffic.series[0].issues, 2);
    strict_1.default.equal(s.traffic.last7, 7 * (2 + 9));
    strict_1.default.equal(s.traffic.prev7, 2 * 7 + 6 * 3 + 9); // a1: +3 for six days, then +9
    strict_1.default.ok((s.traffic.changePct ?? 0) > 0);
    strict_1.default.deepEqual(s.top.articles7d.map((a) => a.id), ['a1']);
    strict_1.default.equal(s.top.articlesAll[0].title, 'Alpha');
    strict_1.default.deepEqual(s.submissions.byStatus, { received: 2, accepted: 1 });
    strict_1.default.equal(s.submissions.waiting, 2);
    strict_1.default.equal(s.submissions.oldestWaitingDays, 5);
    strict_1.default.equal(s.submissions.new7d, 2);
    strict_1.default.deepEqual(s.inbox, { total: 2, unread: 1, oldestUnreadDays: 3, new7d: 1 });
    strict_1.default.deepEqual(s.ingest, { running: 1, failed: 1 });
    strict_1.default.deepEqual(s.ai, { chat: { used: 50, limit: 200 }, summaries: { used: 0, limit: 40 } });
    strict_1.default.ok(!/@/.test(JSON.stringify(s)));
});
(0, node_test_1.default)('ops summary copes with an empty project', () => {
    const s = (0, summary_1.buildOpsSummary)({ now: Date.now(), days: [], journals: [], articles: [], submissions: [], contacts: [], ingestJobs: [], ai: {}, aiLimits: {} });
    strict_1.default.equal(s.traffic.lastRollup, null);
    strict_1.default.equal(s.traffic.changePct, null);
    strict_1.default.equal(s.submissions.oldestWaitingDays, null);
    strict_1.default.deepEqual(s.top.articles7d, []);
});
(0, node_test_1.default)('ops token check is strict', () => {
    const token = 'x'.repeat(40);
    strict_1.default.ok((0, summary_1.tokenMatches)(`Bearer ${token}`, token, node_crypto_1.timingSafeEqual));
    strict_1.default.ok(!(0, summary_1.tokenMatches)(`Bearer ${token}y`, token, node_crypto_1.timingSafeEqual));
    strict_1.default.ok(!(0, summary_1.tokenMatches)(token, token, node_crypto_1.timingSafeEqual));
    strict_1.default.ok(!(0, summary_1.tokenMatches)(undefined, token, node_crypto_1.timingSafeEqual));
    strict_1.default.ok(!(0, summary_1.tokenMatches)('Bearer short', 'short', node_crypto_1.timingSafeEqual)); // an unset or weak secret never matches
    strict_1.default.ok(!(0, summary_1.tokenMatches)('Bearer ', '', node_crypto_1.timingSafeEqual));
});
//# sourceMappingURL=ops.test.js.map