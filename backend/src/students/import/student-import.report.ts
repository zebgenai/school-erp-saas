import { toCsv } from './student-import.csv';
import { ColumnAssignment, ImportFieldKey, ImportRowOutcome } from './student-import.types';

const DUPLICATE_POLICY =
  'Duplicates are skipped. A row is a duplicate when its admission number already exists in this school or appears earlier in the file. Existing students are not overwritten, and their class and personal details stay as they are.';

export function duplicatePolicy(): string {
  return DUPLICATE_POLICY;
}

export function presentRow(row: ImportRowOutcome) {
  return {
    rowNumber: row.rowNumber,
    status: row.status,
    values: row.values,
    errors: row.errors,
    warnings: row.warnings,
    duplicate: row.duplicate ?? null,
  };
}

export function buildErrorReportCsv(rows: ImportRowOutcome[]): string {
  const records: string[][] = [];
  for (const row of rows) {
    if (row.status === 'valid') continue;
    const admissionNo = row.values.admissionNo ?? '';
    const fullName = row.values.fullName ?? '';
    if (row.duplicate) {
      records.push([
        String(row.rowNumber),
        admissionNo,
        fullName,
        'Admission Number',
        row.duplicate.message,
        clip(admissionNo),
      ]);
    }
    for (const issue of row.errors) {
      records.push([
        String(row.rowNumber),
        admissionNo,
        fullName,
        labelFor(issue.field),
        issue.message,
        clip(originalValue(row, issue.field)),
      ]);
    }
    if (row.status === 'example') {
      for (const warning of row.warnings) {
        records.push([String(row.rowNumber), admissionNo, fullName, 'Sample', warning, '']);
      }
    }
  }
  return toCsv(
    ['Row', 'Admission Number', 'Student Name', 'Field', 'Reason', 'Value'],
    records,
  );
}

function labelFor(field: string): string {
  if (field === 'admissionNo') return 'Admission Number';
  if (field === 'fullName') return 'Student Name';
  if (field === 'fatherName') return 'Father Name';
  if (field === 'guardianPhone') return 'Guardian Phone';
  if (field === 'whatsappNumber') return 'WhatsApp Number';
  if (field === 'dateOfBirth') return 'Date of Birth';
  if (field === 'admissionDate') return 'Admission Date';
  if (field === 'className') return 'Class';
  if (field === 'sectionName') return 'Section';
  if (field === 'monthlyFee') return 'Monthly Fee';
  if (field === 'feeStatus') return 'Fee Status';
  return field;
}

function originalValue(row: ImportRowOutcome, field: string): string {
  const value = row.values[field as ImportFieldKey];
  return value == null ? '' : String(value);
}

function clip(value: string): string {
  const text = value.replace(/[\r\n]+/g, ' ').trim();
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export function assignmentsForClient(assignments: ColumnAssignment[]): Array<string | null> {
  return assignments.map((value) => value);
}
