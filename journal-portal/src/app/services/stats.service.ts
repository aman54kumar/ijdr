import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData, limit, orderBy, query } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';
import { DailyStats } from '../type/journals.type';

export interface TrendPoint {
  date: string;
  value: number;
}

/** Views gained per day from consecutive cumulative snapshots (the first snapshot has no baseline). */
export function dailyViewTrend(days: DailyStats[], pick: (d: DailyStats) => number): TrendPoint[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(1).map((d, i) => ({ date: d.date, value: Math.max(0, pick(d) - pick(sorted[i])) }));
}

/** Top items by views gained between the oldest and newest snapshot in the window. */
export function topGained(
  days: DailyStats[],
  kind: 'issues' | 'articles',
  max = 5
): { id: string; title: string; views: number }[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return [];
  const first = sorted[0][kind];
  const last = sorted[sorted.length - 1][kind];
  return Object.entries(last)
    .map(([id, v]) => ({ id, title: v.title, views: Math.max(0, v.views - (first[id]?.views ?? 0)) }))
    .filter((x) => x.views > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, max);
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  /** Last `days` daily snapshots, oldest first. */
  recent(days = 30): Observable<DailyStats[]> {
    return collectionData(query(collection(this.firestore, 'statsDaily'), orderBy('date', 'desc'), limit(days))) as Observable<DailyStats[]>;
  }

  async snapshotNow(): Promise<void> {
    await httpsCallable(this.functions, 'rollupStatsNow')({});
  }
}
