import { describeDaysLeft, getNextSubmissionDeadline } from './submission-deadline.util';

describe('getNextSubmissionDeadline', () => {
  const at = (y: number, m: number, d: number) => getNextSubmissionDeadline(new Date(y, m - 1, d, 15, 30));

  it('targets 30 June from the start of the year', () => {
    const r = at(2027, 1, 1);
    expect(r.label).toBe('30 June 2027');
    expect(r.daysLeft).toBe(180);
    expect(r.urgent).toBeFalse();
  });

  it('targets 31 December after June has passed', () => {
    const r = at(2026, 10, 8);
    expect(r.label).toBe('31 December 2026');
    expect(r.daysLeft).toBe(84);
  });

  it('stays on a deadline through its final day', () => {
    const r = at(2026, 6, 30);
    expect(r.label).toBe('30 June 2026');
    expect(r.daysLeft).toBe(0);
    expect(r.urgent).toBeTrue();
  });

  it('rolls over the day after a deadline', () => {
    expect(at(2026, 7, 1).label).toBe('31 December 2026');
    expect(at(2027, 1, 1).label).toBe('30 June 2027');
  });

  it('flags the final 30 days as urgent', () => {
    expect(at(2026, 12, 1).urgent).toBeTrue(); // 30 days left
    expect(at(2026, 11, 30).urgent).toBeFalse(); // 31 days left
  });

  it('describes the countdown', () => {
    expect(describeDaysLeft(0)).toBe('closes today');
    expect(describeDaysLeft(1)).toBe('1 day left');
    expect(describeDaysLeft(12)).toBe('12 days left');
  });
});
