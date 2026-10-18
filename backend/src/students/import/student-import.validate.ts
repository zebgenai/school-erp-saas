import {
  ColumnAssignment,
  IGNORE_COLUMN,
  ImportFieldKey,
  ImportRowOutcome,
  NewStudentWrite,
  RawSheet,
  SchoolCatalog,
} from './student-import.types';

const SAMPLE_ADMISSION = 'EXAMPLE-001';
const LIMITS: Partial<Record<ImportFieldKey, number>> = {
  admissionNo: 64,
  fullName: 150,
  fatherName: 150,
  guardianPhone: 32,
  whatsappNumber: 32,
  address: 500,
  className: 80,
  sectionName: 40,
};

export function validateImportSheet(
  sheet: RawSheet,
  assignments: ColumnAssignment[],
  catalog: SchoolCatalog,
): ImportRowOutcome[] {
  const classes = catalog.classes.filter((item) => item.schoolId === catalog.schoolId);
  const sections = catalog.sections.filter((item) => item.schoolId === catalog.schoolId);
  const outcomes = sheet.rows.map((row) => buildRow(row.rowNumber, row.cells, assignments, classes, sections));
  markDuplicates(outcomes, catalog.existingAdmissionNos);
  return outcomes;
}

function buildRow(
  rowNumber: number,
  cells: { text: string; formulaError?: string }[],
  assignments: ColumnAssignment[],
  classes: SchoolCatalog['classes'],
  sections: SchoolCatalog['sections'],
): ImportRowOutcome {
  const values: Partial<Record<ImportFieldKey, string>> = {};
  const errors: ImportRowOutcome['errors'] = [];
  const warnings: string[] = [];

  assignments.forEach((assignment, index) => {
    if (!assignment || assignment === IGNORE_COLUMN) return;
    const cell = cells[index] ?? { text: '' };
    if (cell.formulaError) {
      errors.push({ field: assignment, message: cell.formulaError });
    }
    values[assignment] = cleanText(cell.text);
  });

  if (isSampleRow(values)) {
    return {
      rowNumber,
      status: 'example',
      values,
      errors: [],
      warnings: ['Sample row was ignored and was not imported. Delete it from the file when you add real students.'],
    };
  }

  const admissionNo = (values.admissionNo ?? '').trim();
  const fullName = collapseSpaces(values.fullName ?? '');
  if (!admissionNo) errors.push({ field: 'admissionNo', message: 'Admission number is required.' });
  else if (admissionNo.length > (LIMITS.admissionNo ?? 64)) {
    errors.push({ field: 'admissionNo', message: 'Admission number is too long.' });
  }

  if (!fullName) errors.push({ field: 'fullName', message: 'Student name is required.' });
  else if (fullName.length > (LIMITS.fullName ?? 150)) {
    errors.push({ field: 'fullName', message: 'Student name is too long.' });
  }

  const fatherName = optionalText(values.fatherName, 'fatherName', 'Father name', errors);
  const guardianPhone = optionalText(values.guardianPhone, 'guardianPhone', 'Guardian phone', errors);
  const whatsappNumber = optionalText(values.whatsappNumber, 'whatsappNumber', 'WhatsApp number', errors);
  const address = optionalText(values.address, 'address', 'Address', errors);
  const gender = parseGender(values.gender, errors);
  const dateOfBirth = parseDateField(values.dateOfBirth, 'dateOfBirth', 'Date of birth', errors);
  const admissionDate = parseDateField(values.admissionDate, 'admissionDate', 'Admission date', errors);
  const monthlyFee = parseMonthlyFee(values.monthlyFee, errors);
  const feeStatus = parseFeeStatus(values.feeStatus, errors);
  const status = parseStatus(values.status, errors);
  const className = optionalText(values.className, 'className', 'Class', errors);
  const sectionName = optionalText(values.sectionName, 'sectionName', 'Section', errors);

  let classId: string | null = null;
  let sectionId: string | null = null;
  if (sectionName && !className) {
    errors.push({ field: 'sectionName', message: 'Section requires a class in the same row.' });
  }
  if (className && !errors.some((issue) => issue.field === 'className')) {
    const matches = matchByName(classes, className);
    if (matches.length === 0) {
      errors.push({
        field: 'className',
        message: `Class "${className}" was not found in this school. Create the class first or correct the name.`,
      });
    } else if (matches.length > 1) {
      errors.push({
        field: 'className',
        message: `Class "${className}" matches more than one class in this school. Rename them so each class name is unique.`,
      });
    } else {
      classId = matches[0].id;
    }
  }
  if (sectionName && classId && !errors.some((issue) => issue.field === 'sectionName')) {
    const inClass = sections.filter((section) => section.classId === classId);
    const matches = matchByName(inClass, sectionName);
    if (matches.length === 0) {
      const elsewhere = matchByName(sections, sectionName);
      errors.push({
        field: 'sectionName',
        message: elsewhere.length
          ? `Section "${sectionName}" does not belong to class "${className}".`
          : `Section "${sectionName}" was not found in this school.`,
      });
    } else if (matches.length > 1) {
      errors.push({
        field: 'sectionName',
        message: `Section "${sectionName}" matches more than one section in this class.`,
      });
    } else {
      sectionId = matches[0].id;
    }
  }

  const feeRejected = errors.some((issue) => issue.field === 'monthlyFee');
  if (!feeRejected && monthlyFee === 0 && feeStatus) {
    warnings.push('Fee status was ignored because the monthly fee is 0.');
  }
  if (!feeRejected && monthlyFee > 0 && !feeStatus) {
    warnings.push('Monthly fee is set without a fee status, so no invoice will be created for this student.');
  }

  const display: Partial<Record<ImportFieldKey, string>> = { ...values };
  if (fullName) display.fullName = fullName;
  if (gender) display.gender = gender;
  if (dateOfBirth) display.dateOfBirth = dateOfBirth;
  if (admissionDate) display.admissionDate = admissionDate;
  if (values.monthlyFee !== undefined && !errors.some((issue) => issue.field === 'monthlyFee')) {
    display.monthlyFee = String(monthlyFee);
  }
  if (feeStatus) display.feeStatus = feeStatus;
  display.status = status;

  if (errors.length > 0) {
    return { rowNumber, status: 'error', values: display, errors, warnings };
  }

  const normalized: NewStudentWrite = {
    admissionNo,
    fullName,
    fatherName,
    guardianPhone,
    whatsappNumber,
    gender,
    dateOfBirth,
    admissionDate,
    address,
    classId,
    sectionId,
    monthlyFee,
    feeStatus: monthlyFee > 0 ? feeStatus : null,
    status,
  };

  return { rowNumber, status: 'valid', values: display, errors, warnings, normalized };
}

function markDuplicates(rows: ImportRowOutcome[], existing: Set<string>) {
  const groups = new Map<string, ImportRowOutcome[]>();
  for (const row of rows) {
    if (row.status === 'example') continue;
    const admissionNo = (row.values.admissionNo ?? '').trim();
    if (!admissionNo || row.errors.some((issue) => issue.field === 'admissionNo')) continue;
    const list = groups.get(admissionNo) ?? [];
    list.push(row);
    groups.set(admissionNo, list);
  }

  for (const [admissionNo, list] of groups) {
    if (existing.has(admissionNo)) {
      for (const row of list) {
        row.status = 'duplicate';
        row.normalized = undefined;
        row.duplicate = {
          field: 'admissionNo',
          source: 'database',
          message: `Admission number ${admissionNo} already exists in this school. The existing student was not changed.`,
        };
      }
      continue;
    }

    const keeper = list.find((row) => row.status === 'valid');
    if (!keeper) {
      if (list.length > 1) {
        const first = list[0].rowNumber;
        for (const row of list.slice(1)) {
          row.warnings.push(`Admission number ${admissionNo} is also used on row ${first}.`);
        }
      }
      continue;
    }

    for (const row of list) {
      if (row === keeper) continue;
      if (row.status !== 'valid') {
        row.warnings.push(`Admission number ${admissionNo} is also used on row ${keeper.rowNumber}.`);
        continue;
      }
      row.status = 'duplicate';
      row.normalized = undefined;
      row.duplicate = {
        field: 'admissionNo',
        source: 'file',
        relatedRow: keeper.rowNumber,
        message: `Row ${row.rowNumber} repeats admission number ${admissionNo}, which is already used on row ${keeper.rowNumber} in this file. Duplicate rows are skipped.`,
      };
    }
  }
}

function isSampleRow(values: Partial<Record<ImportFieldKey, string>>): boolean {
  const admission = (values.admissionNo ?? '').trim().toUpperCase();
  const name = (values.fullName ?? '').trim().toLowerCase();
  return admission === SAMPLE_ADMISSION && name.includes('example student');
}

function optionalText(
  raw: string | undefined,
  field: ImportFieldKey,
  label: string,
  errors: ImportRowOutcome['errors'],
): string | null {
  const value = collapseSpaces(raw ?? '');
  if (!value) return null;
  const limit = LIMITS[field];
  if (limit && value.length > limit) {
    errors.push({ field, message: `${label} is too long.` });
  }
  return value;
}

function parseGender(raw: string | undefined, errors: ImportRowOutcome['errors']): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const key = value.toLowerCase();
  const mapped: Record<string, string> = {
    male: 'MALE',
    m: 'MALE',
    boy: 'MALE',
    female: 'FEMALE',
    f: 'FEMALE',
    girl: 'FEMALE',
    other: 'OTHER',
    o: 'OTHER',
  };
  const gender = mapped[key] ?? (['MALE', 'FEMALE', 'OTHER'].includes(value.toUpperCase()) ? value.toUpperCase() : '');
  if (!gender) {
    errors.push({ field: 'gender', message: 'Gender must be MALE, FEMALE, or OTHER.' });
    return null;
  }
  return gender;
}

function parseStatus(raw: string | undefined, errors: ImportRowOutcome['errors']): string {
  const value = (raw ?? '').trim();
  if (!value) return 'ACTIVE';
  const key = value.toLowerCase();
  if (key === 'active' || key === 'a') return 'ACTIVE';
  if (key === 'inactive' || key === 'i') return 'INACTIVE';
  if (value.toUpperCase() === 'ACTIVE' || value.toUpperCase() === 'INACTIVE') return value.toUpperCase();
  errors.push({ field: 'status', message: 'Status must be ACTIVE or INACTIVE.' });
  return 'ACTIVE';
}

function parseFeeStatus(
  raw: string | undefined,
  errors: ImportRowOutcome['errors'],
): 'PAID' | 'UNPAID' | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const key = value.toLowerCase();
  if (key === 'paid' || key === 'p') return 'PAID';
  if (key === 'unpaid' || key === 'u') return 'UNPAID';
  errors.push({ field: 'feeStatus', message: 'Fee status must be PAID or UNPAID.' });
  return null;
}

function parseMonthlyFee(raw: string | undefined, errors: ImportRowOutcome['errors']): number {
  const value = (raw ?? '').trim().replace(/,/g, '').replace(/\s/g, '');
  if (!value) return 0;
  if (!/^\d+$/.test(value)) {
    errors.push({ field: 'monthlyFee', message: 'Monthly fee must be a whole number (0 or greater).' });
    return 0;
  }
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) {
    errors.push({ field: 'monthlyFee', message: 'Monthly fee must be a whole number (0 or greater).' });
    return 0;
  }
  if (amount > 10_000_000) {
    errors.push({ field: 'monthlyFee', message: 'Monthly fee is too large.' });
    return 0;
  }
  return amount;
}

export function parseDateField(
  raw: string | undefined,
  field: ImportFieldKey,
  label: string,
  errors: ImportRowOutcome['errors'],
): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const parsed = parseImportDate(value);
  if ('error' in parsed) {
    errors.push({ field, message: `${label}: ${parsed.error}` });
    return null;
  }
  return parsed.iso;
}

export function parseImportDate(raw: string): { iso: string } | { error: string } {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(value);
  let year: number;
  let month: number;
  let day: number;
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (/^\d{4,6}$/.test(value)) {
    const serial = excelSerialToIso(Number(value));
    if (!serial) return { error: 'use YYYY-MM-DD, for example 2015-04-12.' };
    return { iso: serial };
  } else {
    return { error: 'use YYYY-MM-DD, for example 2015-04-12.' };
  }
  if (year < 1900 || year > 2100) return { error: 'year must be between 1900 and 2100.' };
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: 'this is not a real calendar date.' };
  }
  return { iso: formatIso(year, month, day) };
}

function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  return formatIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function formatIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function matchByName<T extends { name: string }>(items: T[], raw: string): T[] {
  const trimmed = raw.trim();
  const exact = items.filter((item) => item.name.trim() === trimmed);
  if (exact.length > 0) return exact;
  const folded = collapseSpaces(trimmed).toLowerCase();
  return items.filter((item) => collapseSpaces(item.name).toLowerCase() === folded);
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
}

function collapseSpaces(value: string): string {
  return cleanText(value).replace(/\s+/g, ' ').trim();
}

export function countOutcomes(rows: ImportRowOutcome[]) {
  return {
    totalRows: rows.length,
    validCount: rows.filter((row) => row.status === 'valid').length,
    errorCount: rows.filter((row) => row.status === 'error').length,
    duplicateCount: rows.filter((row) => row.status === 'duplicate').length,
    exampleCount: rows.filter((row) => row.status === 'example').length,
    warningCount: rows.filter((row) => row.warnings.length > 0).length,
  };
}
