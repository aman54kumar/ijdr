"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOpsSummary = buildOpsSummary;
exports.tokenMatches = tokenMatches;
// Pure builder for the read-only ops summary consumed by the external ops portal (unit tested in ops.test.ts).
// It only ever contains aggregates and public titles: no names, e-mail addresses or message text.
const stats_1 = require("./stats");
const DAY = 24 * 3600 * 1000;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const ageDays = (now, ms) => (typeof ms === 'number' && ms > 0 ? Math.max(0, Math.floor((now - ms) / DAY)) : null);
function top(items, max) {
    return items
        .filter((i) => i.views > 0)
        .sort((a, b) => b.views - a.views || a.title.localeCompare(b.title))
        .slice(0, max);
}
function buildOpsSummary(input) {
    const { now } = input;
    const days = [...input.days].sort((a, b) => a.date.localeCompare(b.date));
    const latest = days[days.length - 1];
    // Per-day views are differences between consecutive cumulative snapshots.
    const series = [];
    for (let i = 1; i < days.length; i++) {
        const d = (0, stats_1.viewDeltas)(days[i - 1], days[i]);
        series.push({ date: days[i].date, issues: d.issueViews, articles: d.articleViews });
    }
    const window = series.slice(-30);
    const totals = window.map((p) => p.issues + p.articles);
    const last7 = sum(totals.slice(-7));
    const prev7 = sum(totals.slice(-14, -7));
    const issueSum = sum(window.map((p) => p.issues));
    // Top articles over the last 7 snapshots: cumulative now minus cumulative a week ago.
    const weekAgo = days.length > 7 ? days[days.length - 8] : undefined;
    const articles7d = latest
        ? Object.entries(latest.articles).map(([id, a]) => ({ id, title: a.title, views: Math.max(0, a.views - (weekAgo?.articles[id]?.views ?? 0)) }))
        : [];
    const published = input.articles.filter((a) => a.status === 'published');
    const byStatus = {};
    for (const s of input.submissions)
        byStatus[s.status ?? 'received'] = (byStatus[s.status ?? 'received'] ?? 0) + 1;
    // "Waiting" = no decision or editor action yet.
    const waiting = input.submissions.filter((s) => (s.status ?? 'received') === 'received');
    const waitingAges = waiting.map((s) => ageDays(now, s.createdAtMs)).filter((n) => n !== null);
    const unread = input.contacts.filter((c) => !c.read);
    const unreadAges = unread.map((c) => ageDays(now, c.createdAtMs)).filter((n) => n !== null);
    const recent = (ms) => typeof ms === 'number' && now - ms < 7 * DAY;
    const ai = {};
    for (const [feature, limit] of Object.entries(input.aiLimits)) {
        const used = input.ai[feature];
        ai[feature] = { used: typeof used === 'number' ? used : 0, limit };
    }
    return {
        generatedAt: new Date(now).toISOString(),
        catalogue: {
            issues: input.journals.length,
            published: published.length,
            drafts: input.articles.length - published.length,
            neverOpened: published.filter((a) => !(a.viewCount ?? 0)).length,
            issueViews: sum(input.journals.map((j) => j.viewCount ?? 0)),
            articleViews: sum(published.map((a) => a.viewCount ?? 0)),
        },
        traffic: {
            lastRollup: latest?.date ?? null,
            rollupAgeDays: latest ? Math.max(0, Math.floor((now - Date.parse(`${latest.date}T00:00:00Z`)) / DAY)) : null,
            series: window,
            last7,
            prev7,
            changePct: window.length >= 14 && prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : null,
            depth: issueSum > 0 ? Math.round((sum(window.map((p) => p.articles)) / issueSum) * 10) / 10 : null,
        },
        top: {
            articles7d: top(articles7d, 5),
            articlesAll: top(published.map((a) => ({ id: a.id, title: a.title, views: a.viewCount ?? 0 })), 5),
            issuesAll: top(input.journals.map((j) => ({ id: j.id, title: j.title, views: j.viewCount ?? 0 })), 5),
        },
        submissions: {
            total: input.submissions.length,
            byStatus,
            waiting: waiting.length,
            oldestWaitingDays: waitingAges.length ? Math.max(...waitingAges) : null,
            new7d: input.submissions.filter((s) => recent(s.createdAtMs)).length,
        },
        inbox: {
            total: input.contacts.length,
            unread: unread.length,
            oldestUnreadDays: unreadAges.length ? Math.max(...unreadAges) : null,
            new7d: input.contacts.filter((c) => recent(c.createdAtMs)).length,
        },
        ingest: {
            running: input.ingestJobs.filter((j) => j.state === 'running').length,
            failed: input.ingestJobs.filter((j) => j.state === 'error' || j.state === 'failed').length,
        },
        ai,
    };
}
/** Constant-time bearer check; an unset or short expected token never matches. */
function tokenMatches(header, expected, timingSafeEqual) {
    if (!expected || expected.length < 24)
        return false;
    const given = /^Bearer (.+)$/.exec(header ?? '')?.[1] ?? '';
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}
//# sourceMappingURL=summary.js.map