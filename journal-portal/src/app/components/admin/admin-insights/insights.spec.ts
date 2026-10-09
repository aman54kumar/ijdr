import { DailyStats, Submission, iArticle } from '../../../type/journals.type';
import { activityStats, aiUsage, catalogueStats, contentHealth, median, messageStats, movers, submissionStats, trafficStats } from './insights';

const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });

function art(p: Partial<iArticle>): iArticle {
  return { id: 'a', issueId: 'i', title: 'T', authors: [], keywords: [], status: 'published', source: 'manual', order: 0, issueVolume: 1, issueNumber: 1, issueYear: '2024', issueTitle: 'I', ...p } as iArticle;
}

function day(date: string, issueViews: number, articleViews: number, extra: Partial<DailyStats> = {}): DailyStats {
  return { date, issues: {}, articles: {}, totals: { issueViews, articleViews, contacts: 0, submissions: 0, articlesPublished: 0 }, ai: {}, ...extra };
}

describe('insights', () => {
  it('median handles odd, even and empty', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  describe('trafficStats', () => {
    const days = Array.from({ length: 15 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, '0')}`, i * 2, i * 10));

    it('turns cumulative counters into per-day views', () => {
      const t = trafficStats(days, 30);
      expect(t.dates.length).toBe(14);
      expect(t.issues.every((v) => v === 2)).toBeTrue();
      expect(t.articles.every((v) => v === 10)).toBeTrue();
      expect(t.totalViews).toBe(14 * 12);
      expect(t.streak).toBe(14);
      expect(t.depth).toBe(5);
    });

    it('compares the last 7 days with the 7 before', () => {
      const flat = trafficStats(days, 30);
      expect(flat.week.change).toBe(0);
      const boosted = trafficStats([...days.slice(0, 14), day('2026-09-15', 28 + 100, 140 + 100)], 30);
      expect(boosted.week.change).toBeGreaterThan(0);
    });

    it('handles no data', () => {
      const t = trafficStats([], 30);
      expect(t.totalViews).toBe(0);
      expect(t.best).toBeUndefined();
      expect(t.week.change).toBeNull();
    });
  });

  it('movers split the window in half', () => {
    const mk = (date: string, v: number) => day(date, 0, 0, { articles: { x: { title: 'X', views: v }, y: { title: 'Y', views: 10 } } });
    const m = movers([mk('d1', 0), mk('d2', 1), mk('d3', 2), mk('d4', 20)], 'articles');
    expect(m.rising.map((r) => r.id)).toEqual(['x']);
    expect(m.cooling).toEqual([]);
  });

  it('catalogueStats aggregates authors, keywords, subjects and pages', () => {
    const a = [
      art({ id: '1', title: 'One', viewCount: 10, authors: [{ name: 'Ann Lee', orcid: '0000' }, { name: 'bo' }], keywords: ['Dyslexia', ' dyslexia ', 'Reading'], subject: 'Education', pageStart: 1, pageEnd: 10, language: 'en' }),
      art({ id: '2', title: 'Two', viewCount: 0, authors: [{ name: 'ann lee' }], keywords: ['reading'], subject: 'Education', pageStart: 11, pageEnd: 14, language: 'hi' }),
      art({ id: '3', status: 'draft', viewCount: 99 }),
    ];
    const c = catalogueStats(a, []);
    expect(c.published).toBe(2);
    expect(c.drafts).toBe(1);
    expect(c.totalViews).toBe(10);
    expect(c.totalPages).toBe(14);
    expect(c.authorsTotal).toBe(2);
    expect(c.topAuthors[0].label).toBe('Ann Lee');
    expect(c.topAuthors[0].value).toBe(2);
    expect(c.keywords.find((k) => k.label === 'dyslexia')!.value).toBe(1);
    expect(c.keywords.find((k) => k.label === 'reading')!.value).toBe(2);
    expect(c.subjects[0]).toEqual({ subject: 'Education', articles: 2, views: 10, perArticle: 5 });
    expect(c.neverOpened.map((x) => x.id)).toEqual(['2']);
    expect(c.longest!.pages).toBe(10);
    expect(c.multiAuthorPct).toBe(50);
    expect(c.languages.map((l) => l.label).sort()).toEqual(['English', 'Hindi']);
  });

  it('contentHealth scores completeness', () => {
    expect(contentHealth([], []).score).toBe(0);
    const full = art({ abstract: 'word '.repeat(40), keywords: ['a', 'b', 'c'], subject: 's', pageStart: 1, pageEnd: 2, doi: 'x', language: 'en', authors: [{ name: 'A', orcid: '1' }] });
    expect(contentHealth([full], []).score).toBe(100);
    expect(contentHealth([art({})], []).score).toBe(0);
  });

  it('submissionStats computes rates and waiting times', () => {
    const now = new Date('2026-10-09T00:00:00Z').getTime();
    const sub = (status: Submission['status'], created: string, decided?: string): Submission =>
      ({ id: created, title: 't' + created, status, keywords: ['x'], createdAt: ts(created), history: decided ? [{ status, at: ts(decided), by: 'a' }] : [] }) as unknown as Submission;
    const s = submissionStats(
      [sub('accepted', '2026-09-01T00:00:00Z', '2026-09-11T00:00:00Z'), sub('rejected', '2026-09-01T00:00:00Z', '2026-09-05T00:00:00Z'), sub('received', '2026-09-20T00:00:00Z'), sub('under_review', '2026-10-05T00:00:00Z')],
      now
    );
    expect(s.acceptRate).toBe(50);
    expect(s.medianDecisionDays).toBe(7);
    expect(s.open).toBe(2);
    expect(s.waitingOver14).toBe(1);
    expect(s.oldestOpen!.days).toBe(19);
    expect(s.perMonth.length).toBe(6);
    expect(s.perMonth[5].value).toBe(1);
  });

  it('messageStats counts handled and triage categories', () => {
    const m = messageStats([
      { status: 'new', read: false, createdAt: ts('2026-10-01T00:00:00Z'), triage: { category: 'Submission', priority: 'high' } },
      { status: 'handled', read: true, createdAt: ts('2026-10-02T00:00:00Z'), triage: { category: 'Submission', priority: 'low' } },
      { read: false, createdAt: ts('2026-08-02T00:00:00Z') },
    ] as any, new Date('2026-10-09T00:00:00Z').getTime());
    expect(m.fresh).toBe(2);
    expect(m.handledPct).toBe(33);
    expect(m.highPriorityOpen).toBe(1);
    expect(m.categories[0]).toEqual({ label: 'Submission', value: 2, sub: undefined });
    expect(m.last30).toBe(2);
  });

  it('aiUsage totals per feature against limits', () => {
    const u = aiUsage([day('a', 0, 0, { ai: { chat: 100, summaries: 4 } }), day('b', 0, 0, { ai: { chat: 100 } })], 30);
    const chat = u.rows.find((r) => r.key === 'chat')!;
    expect(chat.total).toBe(200);
    expect(chat.peak).toBe(100);
    expect(chat.usedPct).toBe(50);
    expect(u.total).toBe(204);
  });

  it('activityStats ranks actors and actions', () => {
    const r = activityStats([{ action: 'article.publish', actorEmail: 'a@x' }, { action: 'article.publish', actorEmail: 'a@x' }, { action: 'issue.delete', actorUid: 'u' }] as any);
    expect(r.actions[0]).toEqual({ label: 'article.publish', value: 2, sub: undefined });
    expect(r.actors[0].label).toBe('a@x');
  });
});
