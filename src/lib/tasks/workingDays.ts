// Due dates counted in working days: week offs (from HR's working days) and company
// holidays are skipped. Counting starts the day after the start, so a two-day task given
// on a Friday, with Sunday off, is due on Monday (Saturday, then Monday).

// 1 is Monday and 7 is Sunday, as in HR settings.
function isoWeekdayOf(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function nextDay(date: string) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function isWorkingDate(date: string, workingDays: number[], holidays: ReadonlySet<string>) {
  return workingDays.includes(isoWeekdayOf(date)) && !holidays.has(date);
}

// The date the work is due, and the days off that were skipped on the way.
export function addWorkingDays(start: string, days: number, workingDays: number[], holidays: ReadonlySet<string>) {
  const skipped: string[] = [];
  if (!Number.isInteger(days) || days < 1 || workingDays.length === 0) return { due: start, skipped };
  let date = start;
  let counted = 0;
  // A year of days is far more than any task needs; it stops a bad setting looping.
  for (let step = 0; step < 366 && counted < days; step += 1) {
    date = nextDay(date);
    if (isWorkingDate(date, workingDays, holidays)) counted += 1;
    else skipped.push(date);
  }
  return { due: date, skipped };
}
