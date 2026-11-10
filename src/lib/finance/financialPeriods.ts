// India's financial year runs from 1 April to 31 March. Dates are YYYY-MM-DD strings
// in India time, as used everywhere else in the app.

function parts(isoDate: string) {
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  return { year, month, day };
}

function iso(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function financialYearStart(isoDate: string) {
  const { year, month } = parts(isoDate);
  return month < 4 ? year - 1 : year;
}

// For example "2026-27".
export function financialYearLabel(isoDate: string) {
  const start = financialYearStart(isoDate);
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export const periodKeys = ['this-month', 'last-month', 'this-quarter', 'last-quarter', 'this-year', 'last-year'] as const;
export type PeriodKey = (typeof periodKeys)[number];

export const periodLabels: Record<PeriodKey, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-quarter': 'This quarter',
  'last-quarter': 'Last quarter',
  'this-year': 'This financial year',
  'last-year': 'Last financial year',
};

export type DateRange = { from: string; to: string };

function monthRange(year: number, month: number): DateRange {
  return { from: iso(year, month, 1), to: iso(year, month, lastDayOfMonth(year, month)) };
}

function shiftMonth(year: number, month: number, by: number) {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// Quarters of the financial year (April to June, and so on) match calendar quarters.
function quarterRange(year: number, month: number): DateRange {
  const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
  const end = shiftMonth(year, firstMonth, 2);
  return { from: iso(year, firstMonth, 1), to: iso(end.year, end.month, lastDayOfMonth(end.year, end.month)) };
}

export function periodRange(key: PeriodKey, today: string): DateRange {
  const { year, month } = parts(today);
  switch (key) {
    case 'this-month':
      return monthRange(year, month);
    case 'last-month': {
      const previous = shiftMonth(year, month, -1);
      return monthRange(previous.year, previous.month);
    }
    case 'this-quarter':
      return quarterRange(year, month);
    case 'last-quarter': {
      const previous = shiftMonth(year, month, -3);
      return quarterRange(previous.year, previous.month);
    }
    case 'this-year': {
      const start = financialYearStart(today);
      return { from: iso(start, 4, 1), to: iso(start + 1, 3, 31) };
    }
    case 'last-year': {
      const start = financialYearStart(today) - 1;
      return { from: iso(start, 4, 1), to: iso(start + 1, 3, 31) };
    }
  }
}

// Every month the range touches, as YYYY-MM.
export function monthsInRange({ from, to }: DateRange) {
  const months: string[] = [];
  let { year, month } = parts(from);
  const end = parts(to);
  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    ({ year, month } = shiftMonth(year, month, 1));
    if (months.length > 60) break;
  }
  return months;
}

const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function monthLabel(yearMonth: string) {
  const { year, month } = parts(`${yearMonth}-01`);
  return monthFormat.format(new Date(Date.UTC(year, month - 1, 1)));
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
