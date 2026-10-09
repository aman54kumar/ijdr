// Pure analytics for the admin Insights page (unit tested in insights.spec.ts).
import { AuditEntry, DailyStats, Submission, iArticle } from '../../../type/journals.type';
import { FirebaseJournal } from '../../../services/firebase-journal.service';
import { ContactSubmission, contactStatus } from '../../../services/contact.service';
import { dailyViewTrend } from '../../../services/stats.service';

const DAY = 24 * 3600 * 1000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Daily AI limits, mirrored from functions/src/ai/service.ts (LIMITS). */
export const AI_DAILY_LIMITS: Record<string, { label: string; daily: number }> = {
  summaries: { label: 'Summaries', daily: 40 },
  translation: { label: 'Hindi translation', daily: 40 },
  chat: { label: 'Ask the issue (chat)', daily: 200 },
  semanticSearch: { label: 'Semantic search', daily: 300 },
  contactTriage: { label: 'Message triage', daily: 100 },
};

export interface Bar {
  label: string;
  value: number;
  /** Secondary text shown under the label. */
  sub?: string;
  /** Router link for the label. */
  link?: string[];
}

/** Milliseconds from a Firestore Timestamp, a {seconds} object or a Date; NaN when unknown. */
export function toMs(t: any): number {
  if (!t) return NaN;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.toDate === 'function') return t.toDate().getTime();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  if (t instanceof Date) return t.getTime();
  return NaN;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Top `max` entries of a counter map as bars, biggest first. */
function topBars(map: Map<string, number>, max: number, sub?: (k: string) => string | undefined): Bar[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([label, value]) => ({ label, value, sub: sub?.(label) }));
}

function words(s?: string): number {
  return s ? s.trim().split(/\s+/).filter(Boolean).length : 0;
}

function pageCount(a: iArticle): number {
  return typeof a.pageStart === 'number' && typeof a.pageEnd === 'number' && a.pageEnd >= a.pageStart ? a.pageEnd - a.pageStart + 1 : 0;
}

// ---------------------------------------------------------------- traffic

export interface TrafficStats {
  dates: string[];
  issues: number[];
  articles: number[];
  total: number[];
  totalViews: number;
  avgPerDay: number;
  best?: { date: string; value: number };
  quietest?: { date: string; value: number };
  /** Views in the last 7 days of the window vs the 7 before; null without enough data. */
  week: { current: number; previous: number; change: number | null };
  streak: number;
  weekdays: { label: string; value: number }[];
  busiestWeekday?: string;
  /** Article views per issue view ("how deep readers go"). */
  depth: number | null;
}

export function trafficStats(days: DailyStats[], windowDays: number): TrafficStats {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  // One extra day so the first day in the window has a baseline.
  const win = sorted.slice(-(windowDays + 1));
  const it = dailyViewTrend(win, (d) => d.totals.issueViews);
  const at = dailyViewTrend(win, (d) => d.totals.articleViews);
  const dates = it.map((p) => p.date);
  const issues = it.map((p) => p.value);
  const articles = at.map((p) => p.value);
  const total = issues.map((v, i) => v + (articles[i] ?? 0));
  const totalViews = sum(total);

  let best: TrafficStats['best'];
  let quietest: TrafficStats['quietest'];
  total.forEach((v, i) => {
    if (!best || v > best.value) best = { date: dates[i], value: v };
    if (!quietest || v < quietest.value) quietest = { date: dates[i], value: v };
  });

  // Week-on-week change always looks at the last 14 days, whatever window is shown.
  const recent = [...sorted].slice(-15);
  const ri = dailyViewTrend(recent, (d) => d.totals.issueViews);
  const ra = dailyViewTrend(recent, (d) => d.totals.articleViews);
  const rt = ri.map((p, i) => p.value + (ra[i]?.value ?? 0));
  const cur = sum(rt.slice(-7));
  const prev = sum(rt.slice(-14, -7));
  const week = {
    current: cur,
    previous: prev,
    change: rt.length >= 14 && prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null,
  };

  let streak = 0;
  for (let i = total.length - 1; i >= 0 && total[i] > 0; i--) streak++;

  const byDay = new Array(7).fill(0);
  const dayCount = new Array(7).fill(0);
  dates.forEach((d, i) => {
    const wd = new Date(d + 'T00:00:00Z').getUTCDay();
    byDay[wd] += total[i];
    dayCount[wd]++;
  });
  // Monday first; average per occurrence so uneven windows stay fair.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const weekdays = order.map((wd) => ({ label: WEEKDAYS[wd].slice(0, 3), value: dayCount[wd] ? Math.round(byDay[wd] / dayCount[wd]) : 0 }));
  const top = [...weekdays].sort((a, b) => b.value - a.value)[0];
  const issueSum = sum(issues);

  return {
    dates,
    issues,
    articles,
    total,
    totalViews,
    avgPerDay: total.length ? round1(totalViews / total.length) : 0,
    best,
    quietest,
    week,
    streak,
    weekdays,
    busiestWeekday: top && top.value > 0 ? WEEKDAYS.find((w) => w.startsWith(top.label)) : undefined,
    depth: issueSum > 0 ? round1(sum(articles) / issueSum) : null,
  };
}

export interface Mover {
  id: string;
  title: string;
  views: number;
  delta: number;
}

/** Items whose views per day changed most between the first and second half of the window. */
export function movers(days: DailyStats[], kind: 'issues' | 'articles', max = 5): { rising: Mover[]; cooling: Mover[] } {
  const s = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (s.length < 4) return { rising: [], cooling: [] };
  const mid = Math.floor(s.length / 2);
  const first = s[0][kind];
  const middle = s[mid][kind];
  const last = s[s.length - 1][kind];
  const out: Mover[] = Object.entries(last).map(([id, v]) => {
    const early = Math.max(0, (middle[id]?.views ?? 0) - (first[id]?.views ?? 0));
    const late = Math.max(0, v.views - (middle[id]?.views ?? 0));
    return { id, title: v.title, views: early + late, delta: late - early };
  });
  return {
    rising: out.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, max),
    cooling: out.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, max),
  };
}

// ---------------------------------------------------------------- catalogue

export interface SubjectRow {
  subject: string;
  articles: number;
  views: number;
  perArticle: number;
}

export interface CatalogueStats {
  issues: number;
  published: number;
  drafts: number;
  totalPages: number;
  firstYear?: string;
  lastYear?: string;
  perYear: { label: string; value: number; views: number }[];
  totalViews: number;
  avgViews: number;
  neverOpened: iArticle[];
  mostRead: iArticle[];
  authorsTotal: number;
  topAuthors: Bar[];
  topAuthorsByViews: Bar[];
  topAffiliations: Bar[];
  avgAuthors: number;
  multiAuthorPct: number;
  biggestTeam?: { title: string; size: number };
  orcidPct: number;
  keywords: Bar[];
  keywordsByViews: Bar[];
  subjects: SubjectRow[];
  languages: { label: string; value: number }[];
  avgPages: number;
  longest?: { title: string; pages: number };
  shortest?: { title: string; pages: number };
  avgAbstractWords: number;
  readingHours: number;
  ai: { fromAi: number; manual: number; humanEdited: number; avgConfidence: number | null; needsReview: number };
}

export function catalogueStats(articles: iArticle[], journals: FirebaseJournal[]): CatalogueStats {
  const pub = articles.filter((a) => a.status === 'published');
  const views = (a: iArticle) => a.viewCount ?? 0;
  const totalViews = sum(pub.map(views));

  const yearMap = new Map<string, { n: number; v: number }>();
  for (const a of pub) {
    const y = String(a.issueYear ?? '').trim() || '—';
    const e = yearMap.get(y) ?? { n: 0, v: 0 };
    e.n++;
    e.v += views(a);
    yearMap.set(y, e);
  }
  const years = [...yearMap.keys()].filter((y) => y !== '—').sort();
  const perYear = [...yearMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, e]) => ({ label, value: e.n, views: e.v }));

  // authors
  const authorCount = new Map<string, number>();
  const authorViews = new Map<string, number>();
  const authorName = new Map<string, string>();
  const affil = new Map<string, number>();
  const affilName = new Map<string, string>();
  let withOrcid = 0;
  let authorSlots = 0;
  let biggestTeam: CatalogueStats['biggestTeam'];
  for (const a of pub) {
    const seen = new Set<string>();
    for (const au of a.authors ?? []) {
      const key = au.name?.trim().toLowerCase();
      if (!key) continue;
      authorSlots++;
      if (au.orcid?.trim()) withOrcid++;
      authorName.set(key, authorName.get(key) ?? au.name.trim());
      if (!seen.has(key)) {
        seen.add(key);
        authorCount.set(key, (authorCount.get(key) ?? 0) + 1);
        authorViews.set(key, (authorViews.get(key) ?? 0) + views(a));
      }
      const af = au.affiliation?.trim();
      if (af) {
        const ak = af.toLowerCase();
        affilName.set(ak, affilName.get(ak) ?? af);
        affil.set(ak, (affil.get(ak) ?? 0) + 1);
      }
    }
    const size = a.authors?.length ?? 0;
    if (!biggestTeam || size > biggestTeam.size) biggestTeam = { title: a.title, size };
  }
  const named = (m: Map<string, number>, names: Map<string, string>, max: number, sub?: (k: string) => string | undefined) =>
    topBars(m, max, sub).map((b) => ({ ...b, label: names.get(b.label) ?? b.label, sub: sub ? sub(b.label) : b.sub }));
  const topAuthors = named(authorCount, authorName, 8, (k) => `${authorViews.get(k) ?? 0} views`);
  const topAuthorsByViews = named(authorViews, authorName, 8, (k) => `${authorCount.get(k) ?? 0} article${authorCount.get(k) === 1 ? '' : 's'}`);

  // keywords
  const kwCount = new Map<string, number>();
  const kwViews = new Map<string, number>();
  for (const a of pub) {
    for (const k of new Set((a.keywords ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))) {
      kwCount.set(k, (kwCount.get(k) ?? 0) + 1);
      kwViews.set(k, (kwViews.get(k) ?? 0) + views(a));
    }
  }

  // subjects
  const subj = new Map<string, { n: number; v: number }>();
  for (const a of pub) {
    const s = a.subject?.trim();
    if (!s) continue;
    const e = subj.get(s) ?? { n: 0, v: 0 };
    e.n++;
    e.v += views(a);
    subj.set(s, e);
  }
  const subjects = [...subj.entries()]
    .map(([subject, e]) => ({ subject, articles: e.n, views: e.v, perArticle: round1(e.v / e.n) }))
    .sort((a, b) => b.views - a.views);

  const lang = new Map<string, number>();
  for (const a of pub) {
    const l = a.language === 'hi' ? 'Hindi' : a.language === 'en' ? 'English' : 'Not set';
    lang.set(l, (lang.get(l) ?? 0) + 1);
  }

  const lengths = pub.map((a) => ({ a, p: pageCount(a) })).filter((x) => x.p > 0);
  const longest = [...lengths].sort((x, y) => y.p - x.p)[0];
  const shortest = [...lengths].sort((x, y) => x.p - y.p)[0];
  const totalPages = sum(lengths.map((x) => x.p));

  const aiMade = pub.filter((a) => a.source === 'ai');
  const conf = aiMade.map((a) => a.aiConfidence).filter((c): c is number => typeof c === 'number');

  return {
    issues: journals.length,
    published: pub.length,
    drafts: articles.length - pub.length,
    totalPages,
    firstYear: years[0],
    lastYear: years[years.length - 1],
    perYear,
    totalViews,
    avgViews: pub.length ? round1(totalViews / pub.length) : 0,
    neverOpened: pub.filter((a) => views(a) === 0),
    mostRead: [...pub].sort((a, b) => views(b) - views(a)).slice(0, 8),
    authorsTotal: authorCount.size,
    topAuthors,
    topAuthorsByViews,
    topAffiliations: named(affil, affilName, 6),
    avgAuthors: pub.length ? round1(authorSlots / pub.length) : 0,
    multiAuthorPct: pct(pub.filter((a) => (a.authors?.length ?? 0) > 1).length, pub.length),
    biggestTeam: biggestTeam && biggestTeam.size > 1 ? biggestTeam : undefined,
    orcidPct: pct(withOrcid, authorSlots),
    keywords: topBars(kwCount, 12, (k) => `${kwViews.get(k) ?? 0} views`),
    keywordsByViews: topBars(kwViews, 12, (k) => `${kwCount.get(k) ?? 0} article${kwCount.get(k) === 1 ? '' : 's'}`),
    subjects,
    languages: [...lang.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    avgPages: lengths.length ? round1(avg(lengths.map((x) => x.p))) : 0,
    longest: longest && { title: longest.a.title, pages: longest.p },
    shortest: shortest && { title: shortest.a.title, pages: shortest.p },
    avgAbstractWords: Math.round(avg(pub.map((a) => words(a.abstract)).filter((n) => n > 0))),
    // ~2.5 minutes a page for a dense academic read.
    readingHours: Math.round((totalPages * 2.5) / 60),
    ai: {
      fromAi: aiMade.length,
      manual: pub.length - aiMade.length,
      humanEdited: aiMade.filter((a) => a.humanEdited).length,
      avgConfidence: conf.length ? Math.round(avg(conf) * 100) : null,
      needsReview: articles.filter((a) => a.source === 'ai' && !a.humanEdited && (a.aiConfidence ?? 1) < 0.7).length,
    },
  };
}

// ---------------------------------------------------------------- content health

export interface HealthCheck {
  key: string;
  label: string;
  /** Items that pass (of `total`). */
  ok: number;
  total: number;
  hint: string;
  weight: number;
}

export interface Health {
  score: number;
  checks: HealthCheck[];
  issuesWithoutArticles: number;
  issuesWithoutCover: number;
  issuesDraftOnly: number;
}

export function contentHealth(articles: iArticle[], journals: FirebaseJournal[]): Health {
  const pub = articles.filter((a) => a.status === 'published');
  const n = pub.length;
  const has = (f: (a: iArticle) => boolean) => pub.filter(f).length;
  const checks: HealthCheck[] = [
    { key: 'abstract', label: 'Abstract', ok: has((a) => words(a.abstract) >= 30), total: n, hint: 'Powers search, summaries and Google snippets.', weight: 3 },
    { key: 'keywords', label: 'Keywords (3 or more)', ok: has((a) => (a.keywords?.length ?? 0) >= 3), total: n, hint: 'Drives related articles and the keyword filters.', weight: 3 },
    { key: 'subject', label: 'Subject', ok: has((a) => !!a.subject?.trim()), total: n, hint: 'Needed for the subject breakdown and browse filters.', weight: 2 },
    { key: 'pages', label: 'Page range', ok: has((a) => pageCount(a) > 0), total: n, hint: 'Lets readers jump straight to the article in the PDF.', weight: 2 },
    { key: 'doi', label: 'DOI', ok: has((a) => !!a.doi?.trim()), total: n, hint: 'Makes articles citable and indexable.', weight: 1 },
    { key: 'language', label: 'Language set', ok: has((a) => !!a.language), total: n, hint: 'Used for translation and language filters.', weight: 1 },
    { key: 'orcid', label: 'Lead author ORCID', ok: has((a) => !!a.authors?.[0]?.orcid?.trim()), total: n, hint: 'Helps indexers disambiguate authors.', weight: 1 },
  ];
  const wTotal = sum(checks.map((c) => c.weight));
  const score = n ? Math.round(sum(checks.map((c) => (c.ok / c.total) * c.weight)) / wTotal * 100) : 0;
  return {
    score,
    checks,
    issuesWithoutArticles: journals.filter((j) => !(j.articleCount ?? 0)).length,
    issuesWithoutCover: journals.filter((j) => !j.coverUrl).length,
    issuesDraftOnly: journals.filter((j) => (j.articleCount ?? 0) > 0 && j.articlesStatus !== 'published').length,
  };
}

// ---------------------------------------------------------------- issues

export interface IssueRow {
  id: string;
  title: string;
  year: string;
  articles: number;
  views: number;
  perArticle: number | null;
  share: number;
}

export function issueRows(journals: FirebaseJournal[]): IssueRow[] {
  const total = sum(journals.map((j) => j.viewCount ?? 0));
  return [...journals]
    .map((j) => ({
      id: j.id ?? '',
      title: j.title,
      year: String(j.year ?? ''),
      articles: j.articleCount ?? 0,
      views: j.viewCount ?? 0,
      perArticle: j.articleCount ? round1((j.viewCount ?? 0) / j.articleCount) : null,
      share: pct(j.viewCount ?? 0, total),
    }))
    .sort((a, b) => b.views - a.views);
}

// ---------------------------------------------------------------- submissions

const OPEN: Submission['status'][] = ['received', 'under_review', 'revision'];

export interface SubmissionStats {
  total: number;
  byStatus: { status: Submission['status']; value: number }[];
  open: number;
  acceptRate: number | null;
  medianDecisionDays: number | null;
  waitingOver14: number;
  oldestOpen?: { title: string; days: number };
  perMonth: { label: string; value: number }[];
  last30: number;
  keywords: Bar[];
}

export function submissionStats(subs: Submission[], now = Date.now()): SubmissionStats {
  const statuses: Submission['status'][] = ['received', 'under_review', 'revision', 'accepted', 'rejected'];
  const byStatus = statuses.map((status) => ({ status, value: subs.filter((s) => s.status === status).length }));
  const accepted = byStatus.find((b) => b.status === 'accepted')!.value;
  const rejected = byStatus.find((b) => b.status === 'rejected')!.value;

  const decisionDays: number[] = [];
  for (const s of subs) {
    if (s.status !== 'accepted' && s.status !== 'rejected') continue;
    const created = toMs(s.createdAt);
    const at = [...(s.history ?? [])].reverse().find((h) => h.status === s.status);
    const decided = toMs(at?.at);
    if (!isNaN(created) && !isNaN(decided) && decided >= created) decisionDays.push((decided - created) / DAY);
  }

  const open = subs.filter((s) => OPEN.includes(s.status));
  const ages = open.map((s) => ({ s, days: (now - toMs(s.createdAt)) / DAY })).filter((x) => !isNaN(x.days));
  const oldest = [...ages].sort((a, b) => b.days - a.days)[0];

  const monthly = new Map<string, number>();
  const nowD = new Date(now);
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i, 1));
    months.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: MONTHS[d.getUTCMonth()] });
  }
  for (const s of subs) {
    const t = toMs(s.createdAt);
    if (isNaN(t)) continue;
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    monthly.set(key, (monthly.get(key) ?? 0) + 1);
  }

  const kw = new Map<string, number>();
  for (const s of subs) for (const k of new Set((s.keywords ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))) kw.set(k, (kw.get(k) ?? 0) + 1);

  return {
    total: subs.length,
    byStatus,
    open: open.length,
    acceptRate: accepted + rejected ? pct(accepted, accepted + rejected) : null,
    medianDecisionDays: decisionDays.length ? round1(median(decisionDays)) : null,
    waitingOver14: ages.filter((x) => x.days > 14).length,
    oldestOpen: oldest && { title: oldest.s.title, days: Math.floor(oldest.days) },
    perMonth: months.map((m) => ({ label: m.label, value: monthly.get(m.key) ?? 0 })),
    last30: subs.filter((s) => now - toMs(s.createdAt) <= 30 * DAY).length,
    keywords: topBars(kw, 8),
  };
}

// ---------------------------------------------------------------- messages

export interface MessageStats {
  total: number;
  fresh: number;
  handled: number;
  handledPct: number;
  highPriorityOpen: number;
  categories: Bar[];
  priorities: { label: string; value: number }[];
  perMonth: { label: string; value: number }[];
  last30: number;
}

export function messageStats(msgs: ContactSubmission[], now = Date.now()): MessageStats {
  const handled = msgs.filter((m) => contactStatus(m) === 'handled').length;
  const cat = new Map<string, number>();
  const pri = new Map<string, number>([['High', 0], ['Normal', 0], ['Low', 0]]);
  for (const m of msgs) {
    if (!m.triage) continue;
    const c = m.triage.category?.trim();
    if (c) cat.set(c, (cat.get(c) ?? 0) + 1);
    const p = m.triage.priority === 'high' ? 'High' : m.triage.priority === 'low' ? 'Low' : 'Normal';
    pri.set(p, (pri.get(p) ?? 0) + 1);
  }
  const nowD = new Date(now);
  const months: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i, 1));
    months.push({ key: `${d.getUTCFullYear()}-${d.getUTCMonth()}`, label: MONTHS[d.getUTCMonth()] });
  }
  const monthly = new Map<string, number>();
  for (const m of msgs) {
    const t = toMs(m.createdAt);
    if (isNaN(t)) continue;
    const d = new Date(t);
    const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    monthly.set(key, (monthly.get(key) ?? 0) + 1);
  }
  return {
    total: msgs.length,
    fresh: msgs.length - handled,
    handled,
    handledPct: pct(handled, msgs.length),
    highPriorityOpen: msgs.filter((m) => contactStatus(m) === 'new' && m.triage?.priority === 'high').length,
    categories: topBars(cat, 6),
    priorities: [...pri.entries()].map(([label, value]) => ({ label, value })).filter((p) => p.value > 0),
    perMonth: months.map((m) => ({ label: m.label, value: monthly.get(m.key) ?? 0 })),
    last30: msgs.filter((m) => now - toMs(m.createdAt) <= 30 * DAY).length,
  };
}

// ---------------------------------------------------------------- AI usage

export interface AiUsageRow {
  key: string;
  label: string;
  total: number;
  peak: number;
  /** Share of the combined daily allowance used over the window. */
  usedPct: number;
  perDay: number[];
}

export function aiUsage(days: DailyStats[], windowDays: number): { rows: AiUsageRow[]; total: number; dates: string[] } {
  const win = [...days].sort((a, b) => a.date.localeCompare(b.date)).slice(-windowDays);
  const rows = Object.entries(AI_DAILY_LIMITS).map(([key, def]) => {
    const perDay = win.map((d) => d.ai?.[key] ?? 0);
    const total = sum(perDay);
    return {
      key,
      label: def.label,
      total,
      peak: Math.max(0, ...perDay),
      usedPct: win.length ? Math.min(100, pct(total, def.daily * win.length)) : 0,
      perDay,
    };
  });
  return { rows, total: sum(rows.map((r) => r.total)), dates: win.map((d) => d.date) };
}

// ---------------------------------------------------------------- admin activity

export function activityStats(audit: AuditEntry[]) {
  const actors = new Map<string, number>();
  const actions = new Map<string, number>();
  for (const a of audit) {
    const who = a.actorEmail || a.actorUid;
    actors.set(who, (actors.get(who) ?? 0) + 1);
    actions.set(a.action, (actions.get(a.action) ?? 0) + 1);
  }
  return { actors: topBars(actors, 5), actions: topBars(actions, 6) };
}

// ---------------------------------------------------------------- fun facts

export interface Fact {
  icon: string;
  title: string;
  text: string;
}

export function funFacts(c: CatalogueStats, t: TrafficStats, subs: SubmissionStats): Fact[] {
  const f: Fact[] = [];
  if (c.firstYear && c.lastYear && c.published) {
    const span = c.firstYear === c.lastYear ? `in ${c.firstYear}` : `from ${c.firstYear} to ${c.lastYear}`;
    f.push({ icon: 'bi-journal-richtext', title: `${c.published} articles in the archive`, text: `${c.issues} issues of research published ${span}.` });
  }
  if (c.readingHours > 0) {
    f.push({ icon: 'bi-clock-history', title: `${c.readingHours} hours of reading`, text: `${c.totalPages.toLocaleString()} pages. Reading it all back to back (about 2.5 minutes a page) would take ${c.readingHours >= 24 ? Math.round(c.readingHours / 24) + ' full days' : c.readingHours + ' hours'}.` });
  }
  if (c.topAuthors[0] && c.topAuthors[0].value > 1) {
    f.push({ icon: 'bi-person-check', title: c.topAuthors[0].label, text: `The most published author, with ${c.topAuthors[0].value} articles.` });
  }
  if (c.topAuthorsByViews[0] && c.topAuthorsByViews[0].value > 0) {
    f.push({ icon: 'bi-stars', title: c.topAuthorsByViews[0].label, text: `The most-read author: their articles have ${c.topAuthorsByViews[0].value.toLocaleString()} views in total.` });
  }
  if (c.keywords[0]) {
    f.push({ icon: 'bi-hash', title: `"${c.keywords[0].label}"`, text: `The most common keyword, used in ${c.keywords[0].value} articles.` });
  }
  if (c.longest && c.shortest && c.longest.pages !== c.shortest.pages) {
    f.push({ icon: 'bi-rulers', title: `${c.longest.pages} pages vs ${c.shortest.pages}`, text: `Longest article is ${c.longest.pages} pages (${trunc(c.longest.title)}); the shortest is ${c.shortest.pages}. The average is ${c.avgPages}.` });
  }
  if (c.multiAuthorPct > 0) {
    f.push({ icon: 'bi-people', title: `${c.multiAuthorPct}% are team papers`, text: `On average ${c.avgAuthors} authors per article${c.biggestTeam ? `; the biggest team has ${c.biggestTeam.size}` : ''}.` });
  }
  if (c.avgAbstractWords) {
    f.push({ icon: 'bi-text-paragraph', title: `${c.avgAbstractWords}-word abstracts`, text: 'The average abstract length across published articles.' });
  }
  if (t.busiestWeekday) {
    f.push({ icon: 'bi-calendar-week', title: `${t.busiestWeekday}s are busiest`, text: 'Readers visit most on this day of the week, averaged over the selected period.' });
  }
  if (t.best && t.best.value > 0) {
    f.push({ icon: 'bi-trophy', title: `${t.best.value} views on ${fmtDate(t.best.date)}`, text: 'Your best single day in the selected period.' });
  }
  if (t.streak >= 3) {
    f.push({ icon: 'bi-fire', title: `${t.streak}-day streak`, text: `Readers have visited every single day for the last ${t.streak} days.` });
  }
  if (t.depth) {
    f.push({ icon: 'bi-layers', title: `${t.depth} articles per issue opened`, text: 'How many article pages are read for each issue page opened.' });
  }
  const hi = c.languages.find((l) => l.label === 'Hindi');
  if (hi && hi.value > 0) {
    f.push({ icon: 'bi-translate', title: `${hi.value} Hindi article${hi.value === 1 ? '' : 's'}`, text: 'Published in Hindi, plus on-demand Hindi translations of the rest.' });
  }
  if (subs.medianDecisionDays !== null) {
    f.push({ icon: 'bi-hourglass-split', title: `${subs.medianDecisionDays} days to decide`, text: 'Median time from a manuscript arriving to an accept or reject decision.' });
  }
  return f;
}

function trunc(s: string, n = 40) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return isNaN(d.getTime()) ? iso : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
