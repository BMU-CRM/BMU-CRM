import { describe, expect, it } from 'vitest';
import { scheduleMatches } from '@/server/jobs/cronSchedule';

const at = (iso: string) => new Date(iso);

describe('scheduleMatches', () => {
  it('runs every 15 minutes on the quarter hour', () => {
    expect(scheduleMatches('*/15 * * * *', at('2026-11-09T10:00:00Z'))).toBe(true);
    expect(scheduleMatches('*/15 * * * *', at('2026-11-09T10:45:00Z'))).toBe(true);
    expect(scheduleMatches('*/15 * * * *', at('2026-11-09T10:05:00Z'))).toBe(false);
  });

  it('handles a fixed time, ranges and lists', () => {
    expect(scheduleMatches('30 3 * * *', at('2026-11-09T03:30:00Z'))).toBe(true);
    expect(scheduleMatches('30 3 * * *', at('2026-11-09T04:30:00Z'))).toBe(false);
    expect(scheduleMatches('0 9-17 * * *', at('2026-11-09T12:00:00Z'))).toBe(true);
    expect(scheduleMatches('0 9-17 * * *', at('2026-11-09T18:00:00Z'))).toBe(false);
    expect(scheduleMatches('0,30 * * * *', at('2026-11-09T18:30:00Z'))).toBe(true);
  });

  it('matches days of the week, with Sunday as 0 or 7', () => {
    // 9 November 2026 is a Monday, 15 November a Sunday.
    expect(scheduleMatches('0 0 * * 1-5', at('2026-11-09T00:00:00Z'))).toBe(true);
    expect(scheduleMatches('0 0 * * 1-5', at('2026-11-15T00:00:00Z'))).toBe(false);
    expect(scheduleMatches('0 0 * * 7', at('2026-11-15T00:00:00Z'))).toBe(true);
    expect(scheduleMatches('0 0 * * 0', at('2026-11-15T00:00:00Z'))).toBe(true);
  });

  it('refuses malformed schedules', () => {
    expect(scheduleMatches('* * * *', at('2026-11-09T00:00:00Z'))).toBe(false);
    expect(scheduleMatches('*/0 * * * *', at('2026-11-09T00:00:00Z'))).toBe(false);
    expect(scheduleMatches('x * * * *', at('2026-11-09T00:00:00Z'))).toBe(false);
  });
});
