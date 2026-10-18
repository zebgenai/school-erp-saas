import ExcelJS from 'exceljs';
import { IMPORT_FIELDS } from './student-import.fields';

const SAMPLE = [
  'EXAMPLE-001',
  'Example Student (delete this row)',
  'Example Father',
  '03001234567',
  '03001234567',
  'MALE',
  '2015-04-12',
  '2026-04-01',
  '12 Example Street',
  'Grade 1',
  'A',
  '0',
  '',
  'ACTIVE',
];

export async function buildStudentImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Clever Campus';
  workbook.created = new Date('2026-01-01T00:00:00.000Z');

  const students = workbook.addWorksheet('Students');
  students.addRow(IMPORT_FIELDS.map((field) => field.header));
  students.addRow(SAMPLE);
  styleTemplate(students);

  const instructions = workbook.addWorksheet('Instructions');
  instructions.columns = [{ width: 28 }, { width: 88 }];
  const lines: string[][] = [
    ['Clever Campus student import', ''],
    ['', ''],
    ['How to use this file', 'Fill the Students sheet. Do not rename the column headings if you want them to map automatically.'],
    ['Required columns', 'Admission Number and Student Name are required. Every other column is optional.'],
    ['Sample row', 'The yellow row (EXAMPLE-001 / Example Student) is an example. Delete it before you import real students. It is never saved.'],
    ['Dates', 'Use YYYY-MM-DD, for example 2015-04-12. DD/MM/YYYY is also accepted. A blank admission date uses today.'],
    ['Class', 'Enter the class name exactly as it already exists in Clever Campus, such as Grade 1. The import does not create classes.'],
    ['Section', 'Enter the section in its own column, such as A. The section must already belong to that class. Do not combine them as Grade 1-A.'],
    ['Gender', 'MALE, FEMALE, or OTHER. Male and Female are also accepted.'],
    ['Status', 'ACTIVE or INACTIVE. Leave it blank to admit the student as ACTIVE.'],
    ['Monthly fee', 'A whole number, 0 or greater. Leave blank for 0.'],
    ['Fee status', 'PAID or UNPAID. Used only when the monthly fee is greater than 0, and only to create the current-month invoice. It does not change an existing student.'],
    ['Duplicates', 'Admission number must be unique in your school and unique inside the file. Duplicates are skipped. Existing students are never overwritten, moved, or updated.'],
    ['School', 'Students are imported into the school you are signed in to. A school column in the file cannot move students to another school.'],
    ['Phone', 'Guardian Phone is the parent contact stored on the student. WhatsApp Number is optional and separate.'],
    ['Plain values', 'Type values directly. Formulas are not imported.'],
    ['Size', 'Up to 5 MB and 3,000 student rows per file. Save as .xlsx or .csv (UTF-8).'],
  ];
  lines.forEach((line) => instructions.addRow(line));
  instructions.getRow(1).font = { bold: true, size: 16, color: { argb: 'FF0F3D2E' } };
  instructions.getColumn(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function styleTemplate(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F6E56' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 22;

  IMPORT_FIELDS.forEach((field, index) => {
    const cell = header.getCell(index + 1);
    cell.note = field.required ? `${field.label} (required)` : `${field.label} (optional)`;
  });

  const sample = sheet.getRow(2);
  sample.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } };
  sample.getCell(1).note = 'Example only. Delete this row before importing real students.';

  const widths = [22, 38, 22, 20, 20, 14, 16, 18, 28, 16, 14, 14, 14, 14];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}
