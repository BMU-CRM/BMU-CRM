// The day or the week a workload report covers. A week runs Monday to Sunday, as in the
// database (send_workload_report). Dates are Indian calendar dates, "YYYY-MM-DD".

export type WorkloadPeriodKind = 'day' | 'week';

export type WorkloadPeriod = {
  kind: WorkloadPeriodKind;
  // The date chosen, and the first and last day it stands for.
  date: string;
  from: string;
  to: string;
  // The period before and after, for moving back and forward; null past today.
  previous: string;
  next: string | null;
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function shift(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && isoDate.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && shift(value, 0) === value);
}

// Monday of the week holding the date.
export function weekStart(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shift(date, -((weekday + 6) % 7));
}

// From the page's ?period=day|week&date=..., today if missing or in the future.
export function chooseWorkloadPeriod(params: { period?: string; date?: string }, today: string): WorkloadPeriod {
  const kind: WorkloadPeriodKind = params.period === 'week' ? 'week' : 'day';
  const date = validDate(params.date) && params.date <= today ? params.date : today;
  const from = kind === 'week' ? weekStart(date) : date;
  const to = kind === 'week' ? shift(from, 6) : date;
  const step = kind === 'week' ? 7 : 1;
  const next = shift(from, step);
  return { kind, date, from, to, previous: shift(from, -step), next: next <= today ? next : null };
}

const longDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const asDate = (date: string) => new Date(`${date}T00:00:00Z`);

// "18 Nov 2026", or "17 Nov – 23 Nov 2026" for a week.
export function workloadPeriodLabel(period: Pick<WorkloadPeriod, 'kind' | 'from' | 'to'>) {
  if (period.kind === 'day') return longDate.format(asDate(period.from));
  return `${shortDate.format(asDate(period.from))} – ${longDate.format(asDate(period.to))}`;
}

// "workload-day-2026-11-18.csv", "workload-week-2026-11-17.csv".
export function workloadFileName(period: Pick<WorkloadPeriod, 'kind' | 'from'>) {
  return `workload-${period.kind}-${period.from}.csv`;
}
