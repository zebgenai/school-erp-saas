export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 3000;
export const MAX_IMPORT_COLUMNS = 40;
export const MAX_XLSX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
export const IMPORT_BATCH_SIZE = 50;
export const PREVIEW_ROW_LIMIT = 40;
export const ISSUE_PREVIEW_LIMIT = 100;

export const IGNORE_COLUMN = '__ignore' as const;

export const IMPORT_FIELD_KEYS = [
  'admissionNo',
  'fullName',
  'fatherName',
  'guardianPhone',
  'whatsappNumber',
  'gender',
  'dateOfBirth',
  'admissionDate',
  'address',
  'className',
  'sectionName',
  'monthlyFee',
  'feeStatus',
  'status',
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export type ColumnAssignment = ImportFieldKey | typeof IGNORE_COLUMN | null;

export type NewStudentWrite = {
  admissionNo: string;
  fullName: string;
  fatherName: string | null;
  guardianPhone: string | null;
  whatsappNumber: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  admissionDate: string | null;
  address: string | null;
  classId: string | null;
  sectionId: string | null;
  monthlyFee: number;
  feeStatus: 'PAID' | 'UNPAID' | null;
  status: string;
};

export type RawCell = {
  text: string;
  formulaError?: string;
};

export type RawDataRow = {
  rowNumber: number;
  cells: RawCell[];
};

export type RawSheet = {
  sheetName: string;
  headerRowNumber: number;
  headers: string[];
  rows: RawDataRow[];
  blankRowsSkipped: number;
  notes: string[];
};

export type RowIssue = {
  field: string;
  message: string;
};

export type ImportRowStatus = 'valid' | 'error' | 'duplicate' | 'example';

export type ImportRowOutcome = {
  rowNumber: number;
  status: ImportRowStatus;
  values: Partial<Record<ImportFieldKey, string>>;
  errors: RowIssue[];
  warnings: string[];
  duplicate?: {
    field: 'admissionNo';
    source: 'file' | 'database';
    message: string;
    relatedRow?: number;
  };
  normalized?: NewStudentWrite;
};

export type ClassCatalogRow = { id: string; name: string; schoolId: string };
export type SectionCatalogRow = { id: string; name: string; classId: string; schoolId: string };

export type SchoolCatalog = {
  schoolId: string;
  classes: ClassCatalogRow[];
  sections: SectionCatalogRow[];
  existingAdmissionNos: Set<string>;
};

export type UploadedImportFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};
