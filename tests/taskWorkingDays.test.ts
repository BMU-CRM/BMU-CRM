// Due dates counted in working days skip week offs and holidays.
import { describe, expect, it } from 'vitest';
import { addWorkingDays, isWorkingDate } from '@/lib/tasks/workingDays';

const mondayToSaturday = [1, 2, 3, 4, 5, 6];
const none = new Set<string>();

describe('working days to finish', () => {
  it('makes a two-day task given on Friday due on Monday, skipping Sunday', () => {
    // 20 November 2026 is a Friday.
    expect(addWorkingDays('2026-11-20', 2, mondayToSaturday, none)).toEqual({ due: '2026-11-23', skipped: ['2026-11-22'] });
  });

  it('counts from the day after the start', () => {
    expect(addWorkingDays('2026-11-16', 1, mondayToSaturday, none).due).toBe('2026-11-17');
    expect(addWorkingDays('2026-11-16', 5, mondayToSaturday, none).due).toBe('2026-11-21');
  });

  it('skips holidays too, and both days of a two-day weekend', () => {
    expect(addWorkingDays('2026-11-20', 2, mondayToSaturday, new Set(['2026-11-23'])).due).toBe('2026-11-24');
    expect(addWorkingDays('2026-11-20', 1, [1, 2, 3, 4, 5], none)).toEqual({ due: '2026-11-23', skipped: ['2026-11-21', '2026-11-22'] });
  });

  it('knows a week off from a working day', () => {
    expect(isWorkingDate('2026-11-22', mondayToSaturday, none)).toBe(false);
    expect(isWorkingDate('2026-11-21', mondayToSaturday, none)).toBe(true);
  });

  it('leaves the date alone for no days or no working days', () => {
    expect(addWorkingDays('2026-11-20', 0, mondayToSaturday, none).due).toBe('2026-11-20');
    expect(addWorkingDays('2026-11-20', 3, [], none).due).toBe('2026-11-20');
  });
});
