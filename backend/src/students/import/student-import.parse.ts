import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import * as path from 'path';
import { parseCsv } from './student-import.csv';
import { matchHeaderToField } from './student-import.fields';
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  MAX_XLSX_UNCOMPRESSED_BYTES,
  RawCell,
  RawSheet,
} from './student-import.types';

const XLSX_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  '',
]);

const CSV_MIME = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'text/comma-separated-values',
  '',
]);

export function safeUploadName(original: string | undefined): string {
  const base = path.basename(original || 'upload').replace(/[^\w.\- ()]+/g, '_').slice(0, 180);
  return base || 'upload';
}

export function assertImportFile(filename: string, mimetype: string | undefined, buffer: Buffer) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.xls' || ext === '.xlsm' || ext === '.xlsb') {
    throw new BadRequestException(
      'This Excel format is not supported. Save the file as .xlsx or .csv and upload it again.',
    );
  }
  if (ext !== '.xlsx' && ext !== '.csv') {
    throw new BadRequestException('Only .xlsx and .csv files are supported.');
  }
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('The file is empty.');
  }
  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new BadRequestException('File is too large. Maximum size is 5 MB.');
  }

  const mime = (mimetype || '').split(';')[0].trim().toLowerCase();
  if (mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('text/html') || mime === 'application/javascript') {
    throw new BadRequestException('Unsupported file type. Upload an .xlsx or .csv file.');
  }

  if (ext === '.xlsx') {
    if (!XLSX_MIME.has(mime)) {
      throw new BadRequestException('Unsupported file type. Upload an .xlsx or .csv file.');
    }
    if (!isZip(buffer)) {
      throw new BadRequestException('This file is not a valid Excel workbook (.xlsx).');
    }
    assertXlsxArchiveSafe(buffer);
    return;
  }

  if (!CSV_MIME.has(mime)) {
    throw new BadRequestException('Unsupported file type. Upload an .xlsx or .csv file.');
  }
  if (isZip(buffer) || isOleCompound(buffer)) {
    throw new BadRequestException(
      'This file is not a CSV. Save it as .xlsx or export a real comma-separated .csv file.',
    );
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0)) {
    throw new BadRequestException(
      'The CSV file appears to be binary or uses an unsupported encoding. Save it as UTF-8 CSV.',
    );
  }
}

export async function parseImportBuffer(filename: string, buffer: Buffer): Promise<RawSheet> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.csv') return parseCsvSheet(buffer);
  return parseXlsxSheet(buffer);
}

function parseCsvSheet(buffer: Buffer): RawSheet {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  let grid: string[][];
  try {
    grid = parseCsv(text);
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('The CSV file could not be read.');
  }
  return gridToSheet('CSV', grid);
}

async function parseXlsxSheet(buffer: Buffer): Promise<RawSheet> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException('This Excel file is damaged or could not be read. Save it again as .xlsx and retry.');
  }

  const sheet = pickWorksheet(workbook);
  if (!sheet) {
    throw new BadRequestException('The workbook has no worksheets.');
  }

  const occupied: { rowNumber: number; cells: RawCell[] }[] = [];
  let width = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (occupied.length > MAX_IMPORT_ROWS + 15) {
      throw new BadRequestException(
        `This file has too many rows. A single import can include up to ${MAX_IMPORT_ROWS} students.`,
      );
    }
    const cells: RawCell[] = [];
    let lastCol = 0;
    row.eachCell({ includeEmpty: false }, (_cell, colNumber) => {
      if (colNumber > lastCol) lastCol = colNumber;
    });
    if (lastCol > MAX_IMPORT_COLUMNS) {
      throw new BadRequestException(
        `This file has too many columns. Use at most ${MAX_IMPORT_COLUMNS} columns.`,
      );
    }
    const colCount = Math.max(lastCol, width);
    for (let col = 1; col <= colCount; col++) {
      cells.push(readCell(row.getCell(col)));
    }
    while (cells.length > 0 && !cells[cells.length - 1].text && !cells[cells.length - 1].formulaError) {
      cells.pop();
    }
    if (cells.length === 0) return;
    width = Math.max(width, cells.length);
    occupied.push({ rowNumber, cells });
  });

  if (occupied.length === 0) {
    throw new BadRequestException('The worksheet is empty. Add a header row and at least one student.');
  }

  return finalizeSheet(sheet.name || 'Students', occupied);
}

function gridToSheet(sheetName: string, grid: string[][]): RawSheet {
  const occupied = grid
    .map((cells, index) => ({
      rowNumber: index + 1,
      cells: cells.map((text) => ({ text: String(text ?? '') })),
    }))
    .filter((row) => row.cells.some((cell) => cell.text.trim().length > 0));
  if (occupied.length === 0) {
    throw new BadRequestException('The file is empty. Add a header row and at least one student.');
  }
  return finalizeSheet(sheetName, occupied);
}

function finalizeSheet(
  sheetName: string,
  occupied: { rowNumber: number; cells: RawCell[] }[],
): RawSheet {
  const headerIndex = chooseHeaderIndex(occupied);
  const header = occupied[headerIndex];
  const headers = header.cells.map((cell) => cell.text.trim());
  if (headers.every((value) => !value)) {
    throw new BadRequestException('The header row is empty. Add column names in the first row.');
  }
  if (headers.length > MAX_IMPORT_COLUMNS) {
    throw new BadRequestException(
      `This file has too many columns. Use at most ${MAX_IMPORT_COLUMNS} columns.`,
    );
  }

  const notes: string[] = [];
  if (headerIndex > 0) {
    notes.push('Rows above the header were ignored.');
  }

  let blankRowsSkipped = 0;
  const rows: RawSheet['rows'] = [];
  let previous = header.rowNumber;
  for (const row of occupied.slice(headerIndex + 1)) {
    if (row.rowNumber - previous > 1) blankRowsSkipped += row.rowNumber - previous - 1;
    previous = row.rowNumber;
    const cells = headers.map((_, index) => row.cells[index] ?? { text: '' });
    if (cells.every((cell) => !cell.text.trim() && !cell.formulaError)) {
      blankRowsSkipped += 1;
      continue;
    }
    rows.push({ rowNumber: row.rowNumber, cells });
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `This file has too many rows. A single import can include up to ${MAX_IMPORT_ROWS} students.`,
      );
    }
  }

  if (rows.length === 0) {
    throw new BadRequestException('No student rows were found under the header.');
  }

  return {
    sheetName,
    headerRowNumber: header.rowNumber,
    headers,
    rows,
    blankRowsSkipped,
    notes,
  };
}

function chooseHeaderIndex(occupied: { rowNumber: number; cells: RawCell[] }[]): number {
  const window = occupied.slice(0, 15);
  let best = 0;
  let bestScore = -1;
  window.forEach((row, index) => {
    const score = row.cells.reduce((sum, cell) => sum + (matchHeaderToField(cell.text) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

function pickWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  let best: ExcelJS.Worksheet | undefined;
  let bestScore = -1;
  for (const sheet of workbook.worksheets) {
    let score = 0;
    const probe = Math.min(sheet.rowCount || 0, 15);
    for (let rowNumber = 1; rowNumber <= probe; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (matchHeaderToField(cellText(cell).text)) score += 1;
      });
    }
    if (sheet.name.trim().toLowerCase() === 'students') score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = sheet;
    }
  }
  return best ?? workbook.worksheets[0];
}

function readCell(cell: ExcelJS.Cell): RawCell {
  const value = cell.value;
  if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    const result = (value as { result?: unknown }).result;
    if (result == null || result === '') {
      return {
        text: '',
        formulaError: 'This cell contains a formula. Enter a plain value instead.',
      };
    }
    if (typeof result === 'object' && result && 'error' in (result as object)) {
      return { text: '', formulaError: 'This cell contains a formula error. Enter a plain value.' };
    }
    return cellFromValue(result);
  }
  return cellText(cell);
}

function cellText(cell: ExcelJS.Cell): RawCell {
  return cellFromValue(cell.value);
}

function cellFromValue(value: ExcelJS.CellValue | unknown): RawCell {
  if (value == null) return { text: '' };
  if (value instanceof Date) return { text: formatUtcDate(value) };
  if (typeof value === 'number') return { text: Number.isInteger(value) ? String(value) : String(value) };
  if (typeof value === 'boolean') return { text: value ? 'TRUE' : 'FALSE' };
  if (typeof value === 'string') return { text: value };
  if (typeof value === 'object') {
    const record = value as {
      richText?: { text: string }[];
      text?: string;
      result?: unknown;
      formula?: string;
    };
    if (Array.isArray(record.richText)) {
      return { text: record.richText.map((part) => part.text).join('') };
    }
    if (typeof record.text === 'string' && record.text) return { text: record.text };
    if ('formula' in record) {
      return { text: '', formulaError: 'This cell contains a formula. Enter a plain value instead.' };
    }
    if (record.result != null) return cellFromValue(record.result);
  }
  return { text: '' };
}

function formatUtcDate(value: Date): string {
  if (Number.isNaN(value.getTime())) return '';
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isZip(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function isOleCompound(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
}

/** Reject zip bombs, macro workbooks, and truncated xlsx packages without extracting them. */
export function assertXlsxArchiveSafe(buffer: Buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entries = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (entries <= 0 || entries > 200) {
    throw new BadRequestException('This workbook has an unexpected structure. Save it again as .xlsx.');
  }
  if (directoryOffset > buffer.length || directoryOffset + directorySize > buffer.length) {
    throw new BadRequestException('This file is not a valid Excel workbook (.xlsx).');
  }

  let offset = directoryOffset;
  let uncompressed = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new BadRequestException('This file is not a valid Excel workbook (.xlsx).');
    }
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) {
      throw new BadRequestException('This file is not a valid Excel workbook (.xlsx).');
    }
    const name = buffer.toString('utf8', nameStart, nameEnd).replace(/\\/g, '/');
    if (name.includes('..') || name.startsWith('/') || /^[a-z]:/i.test(name)) {
      throw new BadRequestException('This workbook contains an unsafe file entry.');
    }
    if (/vbaProject\.bin/i.test(name) || name.toLowerCase().endsWith('.xlsm')) {
      throw new BadRequestException('Macro-enabled workbooks are not supported. Save a plain .xlsx file and try again.');
    }
    if (size === 0xffffffff) {
      throw new BadRequestException('This spreadsheet is too complex to import. Split it into a smaller file.');
    }
    uncompressed += size;
    if (uncompressed > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new BadRequestException('This spreadsheet is too complex to import. Split it into a smaller file.');
    }
    offset = nameEnd + extraLength + commentLength;
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const signature = 0x06054b50;
  const start = Math.max(0, buffer.length - 22 - 65535);
  for (let index = buffer.length - 22; index >= start; index--) {
    if (buffer.readUInt32LE(index) === signature) return index;
  }
  throw new BadRequestException('This file is not a valid Excel workbook (.xlsx).');
}
