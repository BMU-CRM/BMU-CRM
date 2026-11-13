// Reads the first sheet of an uploaded spreadsheet as rows of text: a CSV file, or an
// Excel workbook (.xlsx, also what Google Sheets downloads). Used on the server only.
// Blank rows are kept, so row 5 of the sheet is rows[4] and problems can name it.
//
// An .xlsx file is a zip of XML files. Only what a plain table needs is read: the
// shared text, and the cell values of the first sheet. Numbers come back as they are
// stored, so a date is a day count and a time a fraction of a day (see excelDate and
// excelTime).
import { inflateRawSync } from 'node:zlib';

export type SheetRows = string[][];

// Splits CSV text into rows, keeping commas and line breaks inside quotes.
export function readCsv(text: string): SheetRows {
  const rows: SheetRows = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return withoutTrailingBlanks(rows);
}

function withoutTrailingBlanks(rows: SheetRows) {
  let end = rows.length;
  while (end > 0 && rows[end - 1]!.every((value) => value === '')) end -= 1;
  return rows.slice(0, end);
}

// The files inside a zip, by name. Only stored and deflated entries are read, which
// is all Excel and Google Sheets write.
function unzip(buffer: Buffer, wanted: (name: string) => boolean) {
  const files = new Map<string, string>();
  let end = -1;
  for (let at = buffer.length - 22; at >= Math.max(0, buffer.length - 65_557); at -= 1) {
    if (buffer.readUInt32LE(at) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end === -1) throw new Error('not a zip');

  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  for (let entry = 0; entry < count; entry += 1) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('broken zip');
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localHeader = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name)) continue;

    const dataStart = localHeader + 30 + buffer.readUInt16LE(localHeader + 26) + buffer.readUInt16LE(localHeader + 28);
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) files.set(name, data.toString('utf8'));
    else if (method === 8) files.set(name, inflateRawSync(data, { maxOutputLength: 50 * 1024 * 1024 }).toString('utf8'));
  }
  return files;
}

function decodeXml(text: string) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// All the text runs inside one shared string or inline string.
function textOf(xml: string) {
  return decodeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join(''));
}

function columnIndex(reference: string) {
  const letters = reference.replace(/\d+$/, '');
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

export function readXlsx(buffer: Buffer): SheetRows {
  const files = unzip(buffer, (name) => name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels' || name === 'xl/sharedStrings.xml' || name.startsWith('xl/worksheets/'));

  // The first sheet in the workbook's order, found through its relationship.
  const workbook = files.get('xl/workbook.xml') ?? '';
  const firstSheetId = workbook.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  const relations = files.get('xl/_rels/workbook.xml.rels') ?? '';
  const target = firstSheetId
    ? [...relations.matchAll(/<Relationship\b[^>]*>/g)].map((match) => match[0]).find((tag) => tag.includes(`Id="${firstSheetId}"`))?.match(/Target="([^"]+)"/)?.[1]
    : undefined;
  const sheetName = target ? `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}` : 'xl/worksheets/sheet1.xml';
  const sheet = files.get(sheetName) ?? files.get('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('no sheet');

  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textOf(match[1]!));

  const rows: SheetRows = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    // Placed by its row number, as Excel leaves out empty rows.
    const rowNumber = Number(rowMatch[1]?.match(/\br="(\d+)"/)?.[1] ?? rows.length + 1);
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1] ?? '';
      const body = cellMatch[2] ?? '';
      const reference = attributes.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attributes.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else value = raw === undefined ? '' : decodeXml(raw);
      const index = reference ? columnIndex(reference) : cells.length;
      while (cells.length < index) cells.push('');
      cells[index] = value.trim();
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return withoutTrailingBlanks(rows);
}

// Reads an uploaded CSV or .xlsx file. Returns null when the file is neither.
export async function readSpreadsheet(file: File): Promise<SheetRows | null> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const isZip = buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
  if (isZip) {
    try {
      return readXlsx(buffer);
    } catch {
      return null;
    }
  }
  if (/\.(xls|xlsx|ods|numbers)$/i.test(file.name)) return null;
  return readCsv(buffer.toString('utf8'));
}

// An Excel date (days since 30 December 1899) as 2026-11-13.
export function excelDate(value: number) {
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
  return date.toISOString().slice(0, 10);
}

// An Excel time (a fraction of a day) as 14:30.
export function excelTime(value: number) {
  const minutes = Math.round((value - Math.floor(value)) * 24 * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
