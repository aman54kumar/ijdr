/**
 * Data-driven "New" / "Popular" labels for journal issues (no randomness).
 *
 * - New: Firestore `createdAt` exists and is within JOURNAL_NEW_MAX_AGE_MS.
 * - Popular: among all issues with viewCount > 0, this issue is in the top
 *   POPULAR_TOP_SHARE by views (cutoff computed from the full catalog).
 */

export const JOURNAL_NEW_MAX_AGE_MS = 45 * 24 * 60 * 60 * 1000;

/** Top this fraction of viewed issues (with views > 0) qualify as Popular. */
const POPULAR_TOP_SHARE = 1 / 3;

export interface JournalHighlightTag {
  readonly label: string;
  readonly kind: 'new' | 'popular';
}

export function firestoreTimestampToMs(value: unknown): number | null {
  if (value == null || typeof value !== 'object') {
    return null;
  }
  const v = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof v.toMillis === 'function') {
    const ms = v.toMillis();
    return typeof ms === 'number' && !Number.isNaN(ms) ? ms : null;
  }
  if (typeof v.seconds === 'number') {
    return v.seconds * 1000 + (typeof v.nanoseconds === 'number' ? v.nanoseconds / 1e6 : 0);
  }
  return null;
}

/**
 * Minimum viewCount required to show "Popular" for the current catalog.
 * Returns +Infinity if no issue has views (no one is Popular).
 */
export function computePopularViewCutoff(journals: { viewCount?: number }[]): number {
  const positive = journals
    .map((j) => Math.max(0, Math.floor(j.viewCount ?? 0)))
    .filter((v) => v > 0)
    .sort((a, b) => b - a);
  if (positive.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const k = Math.max(1, Math.ceil(positive.length * POPULAR_TOP_SHARE));
  return positive[k - 1];
}

export function isJournalPopular(viewCount: number | undefined, cutoff: number): boolean {
  const v = Math.max(0, Math.floor(viewCount ?? 0));
  return cutoff !== Number.POSITIVE_INFINITY && v > 0 && v >= cutoff;
}

export function isJournalNew(createdAt: unknown, nowMs: number): boolean {
  const ms = firestoreTimestampToMs(createdAt);
  if (ms == null) {
    return false;
  }
  return nowMs - ms <= JOURNAL_NEW_MAX_AGE_MS;
}

export function getJournalHighlightTags(
  journal: { viewCount?: number; createdAt?: unknown },
  popularCutoff: number,
  nowMs: number = Date.now()
): JournalHighlightTag[] {
  const tags: JournalHighlightTag[] = [];
  if (isJournalNew(journal.createdAt, nowMs)) {
    tags.push({ label: 'New', kind: 'new' });
  }
  if (isJournalPopular(journal.viewCount, popularCutoff)) {
    tags.push({ label: 'Popular', kind: 'popular' });
  }
  return tags;
}
