import { describe, expect, it } from 'vitest';
import { addDays, calendarRange, datePartInIndia, indiaDateTime, isCalendarDate } from '@/lib/calendar/calendarRange';

describe('isCalendarDate', () => {
  it('accepts real dates, including 29 February in a leap year', () => {
    expect(isCalendarDate('2027-02-28')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
  });

  it('refuses impossible dates and other text', () => {
    expect(isCalendarDate('2027-02-29')).toBe(false);
    expect(isCalendarDate('2027-02-30')).toBe(false);
    expect(isCalendarDate('2027-13-01')).toBe(false);
    expect(isCalendarDate('garbage')).toBe(false);
    expect(isCalendarDate(undefined)).toBe(false);
  });
});

describe('calendarRange', () => {
  it('shows a month as whole weeks from Monday', () => {
    const range = calendarRange('month', '2026-11-19');

    expect(range.from).toBe('2026-10-26');
    expect(range.to).toBe('2026-12-06');
    expect(range.days).toHaveLength(42);
    expect(range.title).toBe('November 2026');
  });

  it('moves between months, including across a year', () => {
    const range = calendarRange('month', '2026-12-15');

    expect(range.previous).toBe('2026-11-01');
    expect(range.next).toBe('2027-01-01');
  });

  it('handles a February that fits in four weeks', () => {
    expect(calendarRange('month', '2027-02-10').days).toHaveLength(28);
  });

  it('starts a week on Monday, even from a Sunday', () => {
    const range = calendarRange('week', '2026-11-15');

    expect(range.from).toBe('2026-11-09');
    expect(range.to).toBe('2026-11-15');
  });

  it('steps one day at a time in day view', () => {
    const range = calendarRange('day', '2026-12-31');

    expect(range.next).toBe('2027-01-01');
    expect(range.days).toEqual(['2026-12-31']);
  });
});

describe('date helpers', () => {
  it('adds days across months', () => {
    expect(addDays('2027-02-27', 2)).toBe('2027-03-01');
  });

  it('reads the date in Indian time, not UTC', () => {
    expect(datePartInIndia('2026-11-09T20:00:00Z')).toBe('2026-11-10');
  });

  it('builds a timestamp from Indian date and time', () => {
    expect(new Date(indiaDateTime('2026-11-10', '09:30')).toISOString()).toBe('2026-11-10T04:00:00.000Z');
  });
});
