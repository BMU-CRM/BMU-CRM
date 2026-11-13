// Reading a content calendar sheet: CSV and Excel files, dates and times as people
// type them, and the rows that cannot be read.
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseCalendarSheet, readSheetDate, readSheetTime } from '@/lib/calendar/parseCalendarSheet';
import { readCsv, readSpreadsheet, readXlsx } from '@/lib/csv/readSpreadsheet';

// A minimal zip, as Excel writes it: each file deflated, with a central directory.
function zip(files: Record<string, string>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, 'utf8'));
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const workbook = zip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Plan" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml':
    '<sst><si><t>Date</t></si><si><t>Start time</t></si><si><t>Category</t></si><si><t>Title</t></si><si><r><t>Diwali </t></r><r><t>poster &amp; reel</t></r></si><si><t>Posters and design</t></si></sst>',
  'xl/worksheets/sheet1.xml':
    '<worksheet><sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
    '<row r="2"><c r="A2" s="1"><v>46339</v></c><c r="B2" s="2"><v>0.4375</v></c><c r="C2" t="s"><v>5</v></c><c r="D2" t="s"><v>4</v></c></row>' +
    '<row r="3"/>' +
    '<row r="4"><c r="A4" t="inlineStr"><is><t>14/11/2026</t></is></c><c r="C4" t="s"><v>5</v></c><c r="D4" t="inlineStr"><is><t>Reel</t></is></c></row>' +
    '</sheetData></worksheet>',
});

describe('reading spreadsheets', () => {
  it('reads CSV, with quoted commas and line breaks', () => {
    expect(readCsv('﻿Date,Title\r\n13/11/2026,"Poster, with ""quotes"""\n14/11/2026,"Two\nlines"\n\n')).toEqual([
      ['Date', 'Title'],
      ['13/11/2026', 'Poster, with "quotes"'],
      ['14/11/2026', 'Two\nlines'],
    ]);
  });

  it('keeps blank rows, so row numbers match the sheet', () => {
    expect(readCsv('a\n\nb\n\n')).toEqual([['a'], [''], ['b']]);
  });

  it('reads the first sheet of an Excel file, with shared and inline text', () => {
    expect(readXlsx(workbook)).toEqual([
      ['Date', 'Start time', 'Category', 'Title'],
      ['46339', '0.4375', 'Posters and design', 'Diwali poster & reel'],
      [],
      ['14/11/2026', '', 'Posters and design', 'Reel'],
    ]);
  });

  it('tells an Excel file from a CSV by its contents, and refuses old .xls files', async () => {
    const excel = new File([new Uint8Array(workbook)], 'plan.xlsx');
    expect((await readSpreadsheet(excel))?.[1]?.[3]).toBe('Diwali poster & reel');
    expect(await readSpreadsheet(new File(['old'], 'plan.xls'))).toBeNull();
    expect(await readSpreadsheet(new File(['Date,Title'], 'plan.csv'))).toEqual([['Date', 'Title']]);
  });
});

describe('content calendar sheets', () => {
  it('reads dates and times as people type them', () => {
    expect(readSheetDate('2026-11-13')).toBe('2026-11-13');
    expect(readSheetDate('13/11/2026')).toBe('2026-11-13');
    expect(readSheetDate('13-11-26')).toBe('2026-11-13');
    expect(readSheetDate('13 Nov 2026')).toBe('2026-11-13');
    expect(readSheetDate('November 13, 2026')).toBe('2026-11-13');
    expect(readSheetDate('46339')).toBe('2026-11-13');
    expect(readSheetDate('31/02/2026')).toBeNull();
    expect(readSheetDate('soon')).toBeNull();

    expect(readSheetTime('14:30')).toBe('14:30');
    expect(readSheetTime('2:30 PM')).toBe('14:30');
    expect(readSheetTime('12 am')).toBe('00:00');
    expect(readSheetTime('0.4375')).toBe('10:30');
    expect(readSheetTime('')).toBe('');
    expect(readSheetTime('25:00')).toBeNull();
  });

  it('turns rows into entries, with the usual times when none are given', () => {
    const result = parseCalendarSheet(readXlsx(workbook));
    expect(result.error).toBeNull();
    expect(result.problems).toEqual([]);
    expect(result.entries).toEqual([
      { line: 2, date: '2026-11-13', startTime: '10:30', endTime: '11:30', category: 'Posters and design', title: 'Diwali poster & reel', brief: '' },
      { line: 4, date: '2026-11-14', startTime: '10:00', endTime: '11:00', category: 'Posters and design', title: 'Reel', brief: '' },
    ]);
  });

  it('finds the headings below a few lines of notes, in any order', () => {
    const result = parseCalendarSheet(readCsv('November plan\n\nTitle,Brief,Category,End time,Date,Start time\nOffer post,Use the new logo,Video shoot,13:00,20/11/2026,11:00'));
    expect(result.entries).toEqual([
      { line: 4, date: '2026-11-20', startTime: '11:00', endTime: '13:00', category: 'Video shoot', title: 'Offer post', brief: 'Use the new logo' },
    ]);
  });

  it('lists the rows it cannot read, by their row number', () => {
    const result = parseCalendarSheet(readCsv('Date,Category,Title,Start time,End time\nsoon,Video,Shoot\n20/11/2026,,Shoot\n20/11/2026,Video,Shoot,15:00,14:00\n20/11/2026,Video,Shoot'));
    expect(result.problems).toEqual([
      { line: 2, message: 'the date could not be read' },
      { line: 3, message: 'the category is missing' },
      { line: 4, message: 'it ends before it starts' },
    ]);
    expect(result.entries).toHaveLength(1);
  });

  it('needs the headings', () => {
    expect(parseCalendarSheet(readCsv('a,b\n1,2')).error).toContain('headings');
    expect(parseCalendarSheet(readCsv('Date,Title\n20/11/2026,Shoot')).error).toContain('Category');
  });
});
