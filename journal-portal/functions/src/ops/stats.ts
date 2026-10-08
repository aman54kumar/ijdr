// Pure helpers for the daily stats rollup (unit tested in ops.test.ts).

export interface DailyStats {
  date: string; // yyyy-mm-dd (UTC)
  /** Cumulative view counters at rollup time; daily views are the difference between two days. */
  issues: Record<string, { title: string; views: number }>;
  articles: Record<string, { title: string; views: number }>;
  totals: { issueViews: number; articleViews: number; contacts: number; submissions: number; articlesPublished: number };
  ai: Record<string, number>;
}

export function buildDailyStats(input: {
  date: string;
  journals: { id: string; title: string; viewCount?: number }[];
  articles: { id: string; title: string; viewCount?: number; status?: string }[];
  contacts: number;
  submissions: number;
  ai: Record<string, unknown>;
}): DailyStats {
  const issues: DailyStats['issues'] = {};
  let issueViews = 0;
  for (const j of input.journals) {
    const v = j.viewCount ?? 0;
    issues[j.id] = { title: j.title, views: v };
    issueViews += v;
  }
  const articles: DailyStats['articles'] = {};
  let articleViews = 0;
  let published = 0;
  for (const a of input.articles) {
    if (a.status !== 'published') continue;
    published++;
    const v = a.viewCount ?? 0;
    articles[a.id] = { title: a.title, views: v };
    articleViews += v;
  }
  const ai: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.ai)) {
    if (typeof v === 'number') ai[k] = v;
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
export function viewDeltas(prev: DailyStats | undefined, curr: DailyStats) {
  const delta = (a: Record<string, { views: number }>, b: Record<string, { views: number }>) => {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(b)) out[id] = Math.max(0, v.views - (a[id]?.views ?? 0));
    return out;
  };
  const issues = delta(prev?.issues ?? {}, curr.issues);
  const articles = delta(prev?.articles ?? {}, curr.articles);
  const sum = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);
  return { issues, articles, issueViews: sum(issues), articleViews: sum(articles) };
}

export function yesterday(d = new Date()): string {
  return new Date(d.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
}
