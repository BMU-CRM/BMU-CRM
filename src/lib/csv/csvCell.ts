// A cell that starts with = + - @ could run as a formula in a spreadsheet, so it is
// prefixed with an apostrophe. Numbers are written with two decimals.
export function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toFixed(2);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// The rows as a CSV file Excel opens correctly, with a byte order mark for Unicode.
export function csvResponse(header: string[], rows: string[][], fileName: string) {
  const csv = [header.map(csvCell), ...rows].map((row) => row.join(',')).join('\r\n');
  return new Response(`\uFEFF${csv}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
