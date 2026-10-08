/** Fixed twice-yearly submission deadlines: 30 June and 31 December. */
const DEADLINES: ReadonlyArray<{ month: number; day: number }> = [
  { month: 5, day: 30 }, // 30 June (month is zero-based)
  { month: 11, day: 31 }, // 31 December
];

/** Within this many days the banner switches to urgent wording. */
export const DEADLINE_URGENT_DAYS = 30;

export interface SubmissionDeadline {
  date: Date;
  /** Whole calendar days left; 0 means the deadline is today. */
  daysLeft: number;
  /** e.g. "31 December 2026" */
  label: string;
  urgent: boolean;
}

const MS_PER_DAY = 86_400_000;

function dayNumber(y: number, m: number, d: number): number {
  // UTC avoids daylight-saving drift when counting calendar days
  return Math.floor(Date.UTC(y, m, d) / MS_PER_DAY);
}

/**
 * The next deadline on or after `now`. A deadline stays current through the
 * end of its own day, then rolls over to the next one (31 Dec -> 30 June).
 */
export function getNextSubmissionDeadline(now: Date = new Date()): SubmissionDeadline {
  const today = dayNumber(now.getFullYear(), now.getMonth(), now.getDate());

  for (let year = now.getFullYear(); year <= now.getFullYear() + 1; year++) {
    for (const { month, day } of DEADLINES) {
      const daysLeft = dayNumber(year, month, day) - today;
      if (daysLeft >= 0) {
        const date = new Date(year, month, day);
        return {
          date,
          daysLeft,
          label: date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
          urgent: daysLeft <= DEADLINE_URGENT_DAYS,
        };
      }
    }
  }
  /* istanbul ignore next: unreachable, 31 Dec of next year is always ahead */
  throw new Error('No upcoming submission deadline');
}

/** Short countdown phrase for the banner, e.g. "84 days left". */
export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return 'closes today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}
