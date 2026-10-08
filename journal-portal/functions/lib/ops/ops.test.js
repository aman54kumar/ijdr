"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const stats_1 = require("./stats");
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
//# sourceMappingURL=ops.test.js.map