// The default quotation terms start with "This quotation is valid until <date>.". The
// date there follows the quotation's own "Valid until" date, so the template's date is
// never printed by mistake.

const validUntilLine = /(valid until\s+)([^.\n]+)(\.)/i;

const longDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// "2026-11-10" as "10 November 2026".
export function formatLongDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : longDate.format(date);
}

// The date a quotation is valid until: the date chosen, or the quotation date plus the
// company's usual number of days.
export function validUntilDate(endDate: string | null | undefined, issueDate: string, validityDays: number) {
  if (endDate) return endDate;
  const date = new Date(`${issueDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + validityDays);
  return date.toISOString().slice(0, 10);
}

// The terms with the "valid until" date replaced. Terms without that line are unchanged.
export function withValidUntil(terms: string, isoDate: string | null) {
  const formatted = isoDate ? formatLongDate(isoDate) : null;
  if (!formatted || !validUntilLine.test(terms)) return terms;
  return terms.replace(validUntilLine, `$1${formatted}$3`);
}

// The date currently written in the "valid until" line, if any.
export function writtenValidUntil(terms: string) {
  return terms.match(validUntilLine)?.[2]?.trim() ?? null;
}
