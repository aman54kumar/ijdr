import { DailyStats } from '../type/journals.type';
import { checkFile } from './submission.service';
import { dailyViewTrend, topGained } from './stats.service';
import { contactStatus } from './contact.service';

const day = (date: string, issueViews: number, a: number, b: number): DailyStats => ({
  date,
  issues: { i1: { title: 'Issue 1', views: issueViews } },
  articles: { a1: { title: 'A1', views: a }, a2: { title: 'A2', views: b } },
  totals: { issueViews, articleViews: a + b, contacts: 0, submissions: 0, articlesPublished: 2 },
  ai: {},
});

describe('stats trends', () => {
  const days = [day('2026-10-03', 10, 1, 0), day('2026-10-01', 4, 0, 0), day('2026-10-02', 7, 1, 2)];

  it('computes daily gains from cumulative snapshots, in date order', () => {
    expect(dailyViewTrend(days, (d) => d.totals.issueViews)).toEqual([
      { date: '2026-10-02', value: 3 },
      { date: '2026-10-03', value: 3 },
    ]);
    // a counter that went down (e.g. an article was deleted) never gives a negative day
    expect(dailyViewTrend(days, (d) => d.totals.articleViews).map((p) => p.value)).toEqual([3, 0]);
    expect(dailyViewTrend([days[0]], (d) => d.totals.issueViews)).toEqual([]);
  });

  it('ranks top gained items over the window', () => {
    expect(topGained(days, 'issues')).toEqual([{ id: 'i1', title: 'Issue 1', views: 6 }]);
    // measured first snapshot to last: a1 gained 1, a2 ended where it started
    expect(topGained(days, 'articles').map((x) => x.id)).toEqual(['a1']);
    expect(topGained([days[0]], 'issues')).toEqual([]);
  });
});

describe('submission file check', () => {
  const f = (name: string, size: number) => new File([new Uint8Array(size)], name);

  it('accepts PDF/DOC/DOCX within the size limits', () => {
    expect(checkFile('manuscript', f('a.pdf', 10))).toBeNull();
    expect(checkFile('manuscript', f('a.DOCX', 10))).toBeNull();
    expect(checkFile('coverLetter', f('c.doc', 10))).toBeNull();
  });

  it('rejects other types, empty files and oversize files', () => {
    expect(checkFile('manuscript', f('a.exe', 10))).toContain('PDF, DOC or DOCX');
    expect(checkFile('manuscript', f('a.pdf', 0))).toContain('empty');
    expect(checkFile('manuscript', f('a.pdf', 16 * 1048576))).toContain('15 MB');
    expect(checkFile('coverLetter', f('a.pdf', 6 * 1048576))).toContain('5 MB');
  });
});

describe('contact status', () => {
  it('derives status from the legacy read flag', () => {
    expect(contactStatus({ read: false })).toBe('new');
    expect(contactStatus({ read: true })).toBe('handled');
    expect(contactStatus({ read: false, status: 'handled' })).toBe('handled');
  });
});
