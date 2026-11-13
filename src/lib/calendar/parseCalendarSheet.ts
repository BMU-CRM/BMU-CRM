// Reads content calendar entries from a spreadsheet's rows. Columns are found by their
// heading, in any order: Date, Category and Title are needed; Start time, End time and
// Brief are optional. A missing start time is 10:00 and a missing end time an hour
// after the start.

import { excelDate, excelTime, type SheetRows } from '@/lib/csv/readSpreadsheet';

export type CalendarSheetEntry = {
  line: number;
  date: string;
  startTime: string;
  endTime: string;
  category: string;
  title: string;
  brief: string;
};

export type CalendarSheetResult = {
  entries: CalendarSheetEntry[];
  problems: { line: number; message: string }[];
  error: string | null;
};

export const calendarSheetHeadings = ['Date', 'Start time', 'End time', 'Category', 'Title', 'Brief'];

const columnNames = {
  date: ['date', 'day', 'post date', 'publish date', 'posting date', 'shoot date'],
  start: ['start time', 'start', 'time', 'from', 'starts'],
  end: ['end time', 'end', 'to', 'ends', 'until'],
  category: ['category', 'type', 'work type', 'content type'],
  title: ['title', 'content', 'topic', 'post', 'subject', 'name'],
  brief: ['brief', 'description', 'details', 'notes', 'caption', 'agenda'],
};

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// 2026-11-13, 13/11/2026, 13-11-26, 13 Nov 2026, Nov 13, 2026, or an Excel date.
export function readSheetDate(text: string) {
  const value = text.trim();
  if (/^\d+(\.\d+)?$/.test(value)) {
    const number = Number(value);
    return number > 20_000 && number < 80_000 ? excelDate(number) : null;
  }
  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (match) return validDate(Number(match[3]!.length === 2 ? `20${match[3]}` : match[3]), Number(match[2]), Number(match[1]));
  match = value.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s,-]+(\d{4})$/i);
  if (match) return validDate(Number(match[3]), months.indexOf(match[2]!.toLowerCase()) + 1, Number(match[1]));
  match = value.match(/^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (match) return validDate(Number(match[3]), months.indexOf(match[1]!.toLowerCase()) + 1, Number(match[2]));
  return null;
}

// 14:30, 2:30 PM, 2 pm, 1430, or an Excel time.
export function readSheetTime(text: string) {
  const value = text.trim().toLowerCase();
  if (value === '') return '';
  if (/^0?\.\d+$/.test(value) || value === '0') return excelTime(Number(value));
  const match = value.match(/^(\d{1,2})(?:[:.](\d{2}))?(?::\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/) ?? value.match(/^(\d{2})(\d{2})()$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const half = match[3]?.replaceAll('.', '');
  if (half) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (half === 'pm' ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addHour(time: string) {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  const total = Math.min(hours * 60 + minutes + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function parseCalendarSheet(rows: SheetRows): CalendarSheetResult {
  const normal = (cell: string) => cell.trim().toLowerCase().replace(/\s+/g, ' ');
  // A few lines of notes above the table are skipped: the heading row is the first one
  // naming a date and a title.
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map(normal);
    return cells.some((cell) => columnNames.date.includes(cell)) && cells.some((cell) => columnNames.title.includes(cell));
  });
  if (headerIndex === -1) {
    return { entries: [], problems: [], error: `Could not find the headings. The first row needs ${calendarSheetHeadings.join(', ')}.` };
  }

  const header = rows[headerIndex]!.map(normal);
  const find = (names: string[]) => header.findIndex((cell) => names.includes(cell));
  const at = {
    date: find(columnNames.date),
    start: find(columnNames.start),
    end: find(columnNames.end),
    category: find(columnNames.category),
    title: find(columnNames.title),
    brief: find(columnNames.brief),
  };
  if (at.category === -1) return { entries: [], problems: [], error: 'Add a Category column, with the category of each entry.' };

  const entries: CalendarSheetEntry[] = [];
  const problems: CalendarSheetResult['problems'] = [];
  rows.slice(headerIndex + 1).forEach((cells, index) => {
    const line = headerIndex + index + 2;
    const cell = (column: number) => (column === -1 ? '' : (cells[column] ?? '').trim());
    if (cells.every((value) => value.trim() === '')) return;

    const date = readSheetDate(cell(at.date));
    const title = cell(at.title);
    const category = cell(at.category);
    const start = readSheetTime(cell(at.start));
    const end = readSheetTime(cell(at.end));
    if (!date) return problems.push({ line, message: 'the date could not be read' });
    if (title.length < 2) return problems.push({ line, message: 'the title is missing' });
    if (!category) return problems.push({ line, message: 'the category is missing' });
    if (start === null || end === null) return problems.push({ line, message: 'a time could not be read' });

    const startTime = start || '10:00';
    const endTime = end || addHour(startTime);
    if (endTime <= startTime) return problems.push({ line, message: 'it ends before it starts' });
    entries.push({ line, date, startTime, endTime, category, title: title.slice(0, 200), brief: cell(at.brief).slice(0, 4000) });
  });

  if (entries.length === 0 && problems.length === 0) return { entries, problems, error: 'The sheet has no entries under the headings.' };
  return { entries, problems, error: null };
}
