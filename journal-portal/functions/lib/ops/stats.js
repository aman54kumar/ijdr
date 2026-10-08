"use strict";
// Pure helpers for the daily stats rollup (unit tested in ops.test.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDailyStats = buildDailyStats;
exports.viewDeltas = viewDeltas;
exports.yesterday = yesterday;
function buildDailyStats(input) {
    const issues = {};
    let issueViews = 0;
    for (const j of input.journals) {
        const v = j.viewCount ?? 0;
        issues[j.id] = { title: j.title, views: v };
        issueViews += v;
    }
    const articles = {};
    let articleViews = 0;
    let published = 0;
    for (const a of input.articles) {
        if (a.status !== 'published')
            continue;
        published++;
        const v = a.viewCount ?? 0;
        articles[a.id] = { title: a.title, views: v };
        articleViews += v;
    }
    const ai = {};
    for (const [k, v] of Object.entries(input.ai)) {
        if (typeof v === 'number')
            ai[k] = v;
    }
    return {
        date: input.date,
        issues,
        articles,
        totals: { issueViews, articleViews, contacts: input.contacts, submissions: input.submissions, articlesPublished: published },
        ai,
    };
}
/** Views gained between two rollups, per item and in total (never negative). */
function viewDeltas(prev, curr) {
    const delta = (a, b) => {
        const out = {};
        for (const [id, v] of Object.entries(b))
            out[id] = Math.max(0, v.views - (a[id]?.views ?? 0));
        return out;
    };
    const issues = delta(prev?.issues ?? {}, curr.issues);
    const articles = delta(prev?.articles ?? {}, curr.articles);
    const sum = (o) => Object.values(o).reduce((x, y) => x + y, 0);
    return { issues, articles, issueViews: sum(issues), articleViews: sum(articles) };
}
function yesterday(d = new Date()) {
    return new Date(d.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
}
//# sourceMappingURL=stats.js.map