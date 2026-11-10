// Date maths for the calendar. Weeks start on Monday. All dates are plain
// YYYY-MM-DD strings in Indian time, so no time zone can shift a day.

export const calendarViews = ['month', 'week', 'day'] as const;
export type CalendarView = (typeof calendarViews)[number];

function toDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function toText(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toText(date);
}

function addMonths(value: string, months: number) {
  const date = toDate(value);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  return toText(target);
}

function mondayOf(value: string) {
  const day = toDate(value).getUTCDay();
  return addDays(value, day === 0 ? -6 : 1 - day);
}

const monthTitle = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayTitle = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDay = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export type CalendarRange = {
  view: CalendarView;
  focus: string;
  from: string;
  to: string;
  days: string[];
  title: string;
  previous: string;
  next: string;
};

export function calendarRange(view: CalendarView, focus: string): CalendarRange {
  if (view === 'day') {
    return {
      view,
      focus,
      from: focus,
      to: focus,
      days: [focus],
      title: dayTitle.format(toDate(focus)),
      previous: addDays(focus, -1),
      next: addDays(focus, 1),
    };
  }

  if (view === 'week') {
    const from = mondayOf(focus);
    const to = addDays(from, 6);
    return {
      view,
      focus,
      from,
      to,
      days: Array.from({ length: 7 }, (_, index) => addDays(from, index)),
      title: `${shortDay.format(toDate(from))} to ${shortDay.format(toDate(to))}`,
      previous: addDays(focus, -7),
      next: addDays(focus, 7),
    };
  }

  // A month shows whole weeks, so it can begin and end in the neighbouring months.
  const firstOfMonth = `${focus.slice(0, 7)}-01`;
  const lastOfMonth = addDays(addMonths(firstOfMonth, 1), -1);
  const from = mondayOf(firstOfMonth);
  const to = addDays(mondayOf(lastOfMonth), 6);
  const length = Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000) + 1;

  return {
    view,
    focus,
    from,
    to,
    days: Array.from({ length }, (_, index) => addDays(from, index)),
    title: monthTitle.format(toDate(firstOfMonth)),
    previous: addMonths(firstOfMonth, -1),
    next: addMonths(firstOfMonth, 1),
  };
}

// True for a real calendar date such as 2027-02-28, false for 2027-02-30 or other text.
export function isCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = toDate(value);
  return !Number.isNaN(date.getTime()) && toText(date) === value;
}

export function datePartInIndia(timestamp: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(timestamp));
}

// Combines a date and a time typed in Indian time into a timestamp.
export function indiaDateTime(date: string, clock: string) {
  return `${date}T${clock}:00+05:30`;
}
