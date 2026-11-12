// Reads a bank statement exported as CSV. Banks differ, so it looks for columns by name:
// a date, a description (narration, particulars), a reference (cheque or UTR number),
// and either one signed amount or separate debit and withdrawal / credit and deposit
// columns. Dates can be 2026-11-05, 05/11/2026 or 05-11-2026 (day first).

export type StatementRow = { date: string; description: string; reference: string; amount: number; balance: number | null };

// Splits one CSV line, keeping commas inside quotes.
function splitLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function toDate(text: string) {
  const value = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!match) return null;
  const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!;
  const date = `${year}-${match[2]!.padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date;
}

function toNumber(text: string | undefined) {
  if (!text) return null;
  const cleaned = text.replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (cleaned === '' || cleaned === '-') return null;
  const value = Number(cleaned.replace(/(cr|dr)$/i, ''));
  if (Number.isNaN(value)) return null;
  return /dr$/i.test(cleaned) ? -Math.abs(value) : value;
}

const columnNames = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date'],
  description: ['description', 'narration', 'particulars', 'details', 'remarks'],
  reference: ['reference', 'ref no', 'ref no.', 'ref no./cheque no.', 'cheque no', 'cheque no.', 'chq/ref no', 'chq./ref.no.', 'chq no', 'utr', 'utr no', 'reference no', 'reference no.'],
  amount: ['amount'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'withdrawal amt', 'debit amount', 'dr'],
  credit: ['credit', 'deposit', 'deposits', 'deposit amt', 'credit amount', 'cr'],
  balance: ['balance', 'closing balance', 'running balance'],
};

export function parseStatementCsv(text: string): { rows: StatementRow[]; error: string | null; skipped: number } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return { rows: [], error: 'The file has no lines to import.', skipped: 0 };

  // Some banks put a few lines of account details above the table: find the header.
  const headerIndex = lines.findIndex((line) => {
    const cells = splitLine(line).map((cell) => cell.toLowerCase());
    return cells.some((cell) => columnNames.date.includes(cell)) && cells.some((cell) => [...columnNames.amount, ...columnNames.debit, ...columnNames.credit].includes(cell));
  });
  if (headerIndex === -1) return { rows: [], error: 'Could not find the columns. The file needs a date column and an amount, or debit and credit columns.', skipped: 0 };

  const header = splitLine(lines[headerIndex]!).map((cell) => cell.toLowerCase());
  const find = (names: string[]) => header.findIndex((cell) => names.includes(cell));
  const at = {
    date: find(columnNames.date),
    description: find(columnNames.description),
    reference: find(columnNames.reference),
    amount: find(columnNames.amount),
    debit: find(columnNames.debit),
    credit: find(columnNames.credit),
    balance: find(columnNames.balance),
  };

  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(headerIndex + 1)) {
    const cells = splitLine(line);
    const date = toDate(cells[at.date] ?? '');
    let amount: number | null;
    if (at.amount !== -1) amount = toNumber(cells[at.amount]);
    else {
      const credit = toNumber(cells[at.credit]) ?? 0;
      const debit = toNumber(cells[at.debit]) ?? 0;
      amount = Math.abs(credit) - Math.abs(debit);
    }
    if (!date || amount === null || amount === 0) {
      skipped += 1;
      continue;
    }
    rows.push({
      date,
      description: at.description === -1 ? '' : (cells[at.description] ?? ''),
      reference: at.reference === -1 ? '' : (cells[at.reference] ?? ''),
      amount: Math.round(amount * 100) / 100,
      balance: at.balance === -1 ? null : toNumber(cells[at.balance]),
    });
  }
  return { rows, error: rows.length === 0 ? 'No lines with a date and an amount were found.' : null, skipped };
}
