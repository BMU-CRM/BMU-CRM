const monthFormat = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// "2026-11-01" becomes "November 2026".
export function formatPayrollMonth(month: string) {
  return monthFormat.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
}

// The month before the given date, as "2026-10", which is the usual month to pay.
export function previousMonth(today: string) {
  const [year, month] = today.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 2, 1));
  return date.toISOString().slice(0, 7);
}
