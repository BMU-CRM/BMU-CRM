const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' });

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

// The current date in India as YYYY-MM-DD, for comparing with due dates.
export function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function formatDate(value: string | null) {
  return value ? dateFormat.format(new Date(value)) : 'Not set';
}

export function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return 'Not set';
  if (!start) return `Due ${formatDate(end)}`;
  if (!end) return `From ${formatDate(start)}`;
  return `${formatDate(start)} to ${formatDate(end)}`;
}

export function formatDateTime(value: string) {
  return dateTimeFormat.format(new Date(value));
}
