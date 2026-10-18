import { BadRequestException } from '@nestjs/common';
import {
  ColumnAssignment,
  IGNORE_COLUMN,
  IMPORT_FIELD_KEYS,
  ImportFieldKey,
} from './student-import.types';

export type ImportFieldDef = {
  key: ImportFieldKey;
  label: string;
  header: string;
  required: boolean;
  aliases: string[];
};

export const IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: 'admissionNo',
    label: 'Admission Number',
    header: 'Admission Number',
    required: true,
    aliases: [
      'admission number',
      'admission no',
      'admission no.',
      'admission',
      'adm no',
      'adm number',
      'admissionnumber',
      'admissionno',
    ],
  },
  {
    key: 'fullName',
    label: 'Student Name',
    header: 'Student Name',
    required: true,
    aliases: ['student name', 'student s name', 'full name', 'name', 'student'],
  },
  {
    key: 'fatherName',
    label: 'Father Name',
    header: 'Father Name',
    required: false,
    aliases: [
      'father name',
      'father s name',
      'fathers name',
      'father',
      'guardian name',
      'parent name',
    ],
  },
  {
    key: 'guardianPhone',
    label: 'Guardian Phone',
    header: 'Guardian Phone',
    required: false,
    aliases: [
      'guardian phone',
      'phone',
      'phone number',
      'mobile',
      'mobile number',
      'contact',
      'contact number',
      'guardian contact',
    ],
  },
  {
    key: 'whatsappNumber',
    label: 'WhatsApp Number',
    header: 'WhatsApp Number',
    required: false,
    aliases: ['whatsapp number', 'whatsapp', 'whatsapp no', 'whats app', 'whatsapp phone'],
  },
  {
    key: 'gender',
    label: 'Gender',
    header: 'Gender',
    required: false,
    aliases: ['gender', 'sex'],
  },
  {
    key: 'dateOfBirth',
    label: 'Date of Birth',
    header: 'Date of Birth',
    required: false,
    aliases: ['date of birth', 'dob', 'd o b', 'birth date', 'birthdate'],
  },
  {
    key: 'admissionDate',
    label: 'Admission Date',
    header: 'Admission Date',
    required: false,
    aliases: ['admission date', 'date of admission', 'admitted on'],
  },
  {
    key: 'address',
    label: 'Address',
    header: 'Address',
    required: false,
    aliases: ['address', 'home address', 'residential address'],
  },
  {
    key: 'className',
    label: 'Class',
    header: 'Class',
    required: false,
    aliases: ['class', 'class name', 'grade', 'grade name'],
  },
  {
    key: 'sectionName',
    label: 'Section',
    header: 'Section',
    required: false,
    aliases: ['section', 'section name'],
  },
  {
    key: 'monthlyFee',
    label: 'Monthly Fee',
    header: 'Monthly Fee',
    required: false,
    aliases: ['monthly fee', 'fee', 'fee amount', 'tuition fee'],
  },
  {
    key: 'feeStatus',
    label: 'Fee Status',
    header: 'Fee Status',
    required: false,
    aliases: ['fee status', 'fees status', 'payment status'],
  },
  {
    key: 'status',
    label: 'Status',
    header: 'Status',
    required: false,
    aliases: ['status', 'student status'],
  },
];

const ALIAS_TO_FIELD = new Map<string, ImportFieldKey>();
for (const field of IMPORT_FIELDS) {
  ALIAS_TO_FIELD.set(normalizeHeader(field.header), field.key);
  ALIAS_TO_FIELD.set(normalizeHeader(field.label), field.key);
  ALIAS_TO_FIELD.set(normalizeHeader(field.key), field.key);
  for (const alias of field.aliases) ALIAS_TO_FIELD.set(normalizeHeader(alias), field.key);
}

const FIELD_SET = new Set<string>(IMPORT_FIELD_KEYS);

export function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchHeaderToField(header: string): ImportFieldKey | null {
  const key = ALIAS_TO_FIELD.get(normalizeHeader(header));
  return key ?? null;
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function suggestColumnMapping(headers: string[]): ColumnAssignment[] {
  const used = new Set<ImportFieldKey>();
  return headers.map((header) => {
    const key = matchHeaderToField(header);
    if (!key || used.has(key)) return null;
    used.add(key);
    return key;
  });
}

export function fieldCatalog() {
  return IMPORT_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    required: field.required,
  }));
}

function isFieldKey(value: string): value is ImportFieldKey {
  return FIELD_SET.has(value);
}

/**
 * Confirms every spreadsheet column is mapped or explicitly ignored.
 * School, photo, and user ids are not importable fields.
 */
export function resolveColumnMapping(
  headers: string[],
  raw: unknown,
): { assignments: ColumnAssignment[]; errors: string[]; notes: string[]; ready: boolean } {
  const suggested = suggestColumnMapping(headers);
  const errors: string[] = [];
  const notes: string[] = [];
  let assignments: ColumnAssignment[];

  if (raw == null || raw === '') {
    assignments = suggested;
  } else {
    const parsed = parseMappingPayload(raw);
    assignments = headers.map((_, index) => {
      const value = parsed.get(index);
      if (value == null || value === '') return null;
      if (value === IGNORE_COLUMN) return IGNORE_COLUMN;
      if (isFieldKey(value)) return value;
      errors.push(`Column ${columnLetter(index)} uses an unsupported field.`);
      return null;
    });
  }

  if (assignments.length !== headers.length) {
    throw new BadRequestException('Column mapping does not match this file.');
  }

  const used = new Map<ImportFieldKey, number>();
  headers.forEach((header, index) => {
    const assignment = assignments[index];
    const label = header.trim() || `Column ${columnLetter(index)}`;
    if (assignment == null) {
      errors.push(
        `Choose a Clever Campus field or "Don't import" for "${label}" (column ${columnLetter(index)}).`,
      );
      return;
    }
    if (assignment === IGNORE_COLUMN) {
      const suggestion = suggested[index];
      if (suggestion) {
        const field = IMPORT_FIELDS.find((item) => item.key === suggestion);
        notes.push(
          `"${label}" is set to Don't import, so ${field?.label ?? suggestion} values in that column will not be saved.`,
        );
      } else if (header.trim()) {
        notes.push(`"${label}" will not be imported.`);
      }
      return;
    }
    const previous = used.get(assignment);
    if (previous != null) {
      const field = IMPORT_FIELDS.find((item) => item.key === assignment);
      errors.push(
        `${field?.label ?? assignment} is mapped more than once (columns ${columnLetter(previous)} and ${columnLetter(index)}). Keep only one column.`,
      );
    } else {
      used.set(assignment, index);
    }
  });

  for (const field of IMPORT_FIELDS) {
    if (field.required && !used.has(field.key)) {
      errors.push(`Map a column to ${field.label}.`);
    }
  }

  const uniqueErrors = [...new Set(errors)];
  return {
    assignments,
    errors: uniqueErrors,
    notes,
    ready: uniqueErrors.length === 0,
  };
}

function parseMappingPayload(raw: unknown): Map<number, string> {
  let value = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return new Map();
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new BadRequestException('Column mapping could not be read. Check the file and try again.');
    }
  }

  const entries = new Map<number, string>();
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item == null || item === '') return;
      if (typeof item !== 'string') {
        throw new BadRequestException('Column mapping could not be read. Check the file and try again.');
      }
      entries.set(index, item);
    });
    return entries;
  }

  if (!value || typeof value !== 'object') {
    throw new BadRequestException('Column mapping could not be read. Check the file and try again.');
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (!/^\d+$/.test(key)) {
      throw new BadRequestException('Column mapping could not be read. Check the file and try again.');
    }
    if (item == null || item === '') continue;
    if (typeof item !== 'string') {
      throw new BadRequestException('Column mapping could not be read. Check the file and try again.');
    }
    entries.set(Number(key), item);
  }
  return entries;
}
