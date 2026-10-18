import { BadRequestException } from '@nestjs/common';
import { MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from './student-import.types';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushCell(row, cell);
      cell = '';
    } else if (char === '\n') {
      pushCell(row, cell);
      rows.push(row);
      if (rows.length > MAX_IMPORT_ROWS + 5) {
        throw new BadRequestException(
          `This file has too many rows. A single import can include up to ${MAX_IMPORT_ROWS} students.`,
        );
      }
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (inQuotes) {
    throw new BadRequestException('The CSV file is malformed (a quoted value was not closed).');
  }
  if (cell.length > 0 || row.length > 0) {
    pushCell(row, cell);
    rows.push(row);
  }
  return rows;
}

function pushCell(row: string[], cell: string) {
  if (row.length >= MAX_IMPORT_COLUMNS) {
    throw new BadRequestException(
      `This file has too many columns. Use at most ${MAX_IMPORT_COLUMNS} columns.`,
    );
  }
  row.push(cell);
}

/** Prefix spreadsheet formulas so Excel treats the error report as text. */
export function escapeCsvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(headers: string[], records: string[][]): string {
  const lines = [headers, ...records].map((record) => record.map(escapeCsvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
}
