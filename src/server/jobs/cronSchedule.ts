// Checks a standard five-part schedule, such as "*/15 * * * *", against a moment in
// time (UTC): minute, hour, day of month, month, day of week.

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  return field.split(',').some((part) => {
    const [range = '*', stepText] = part.split('/');
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) return false;

    let start = min;
    let end = max;
    if (range !== '*') {
      const [from = Number.NaN, to] = range.split('-').map(Number);
      start = from;
      end = to ?? (stepText ? max : from);
    }
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
    return value >= start && value <= end && (value - start) % step === 0;
  });
}

export function scheduleMatches(expression: string, moment: Date) {
  const [minute, hour, dayOfMonth, month, dayOfWeek, ...extra] = expression.trim().split(/\s+/);
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek || extra.length) return false;

  const weekday = moment.getUTCDay();
  return (
    fieldMatches(minute, moment.getUTCMinutes(), 0, 59) &&
    fieldMatches(hour, moment.getUTCHours(), 0, 23) &&
    fieldMatches(dayOfMonth, moment.getUTCDate(), 1, 31) &&
    fieldMatches(month, moment.getUTCMonth() + 1, 1, 12) &&
    (fieldMatches(dayOfWeek, weekday, 0, 7) || (weekday === 0 && fieldMatches(dayOfWeek, 7, 0, 7)))
  );
}
