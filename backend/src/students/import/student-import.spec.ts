import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import ExcelJS from 'exceljs';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/types/current-user.type';
import { StudentsController } from '../students.controller';
import { StudentsService } from '../students.service';
import { publicImportError } from './student-import.errors';
import { resolveColumnMapping, suggestColumnMapping } from './student-import.fields';
import { assertImportFile, assertXlsxArchiveSafe, parseImportBuffer } from './student-import.parse';
import { escapeCsvCell } from './student-import.csv';
import { buildErrorReportCsv } from './student-import.report';
import { StudentImportService } from './student-import.service';
import { buildStudentImportTemplate } from './student-import.template';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, SchoolCatalog } from './student-import.types';
import { parseImportDate, validateImportSheet } from './student-import.validate';

const admin: CurrentUser = {
  id: 'user-1',
  email: 'admin@school.test',
  name: 'School Admin',
  role: UserRole.SCHOOL_ADMIN,
  schoolId: 'school-a',
};

function rolesOn(method: string): UserRole[] {
  return Reflect.getMetadata(ROLES_KEY, StudentsController.prototype[method]) ?? [];
}

function guardAllows(required: UserRole[], role: UserRole): boolean {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ method: 'POST', user: { role } }) }),
  } as any;
  return guard.canActivate(ctx) as boolean;
}

function csvFile(text: string, name = 'students.csv') {
  return {
    buffer: Buffer.from(text, 'utf8'),
    originalname: name,
    mimetype: 'text/csv',
    size: Buffer.byteLength(text),
  };
}

const baseCatalog = (): SchoolCatalog => ({
  schoolId: 'school-a',
  classes: [
    { id: 'class-1', name: 'Grade 1', schoolId: 'school-a' },
    { id: 'class-2', name: 'Grade 2', schoolId: 'school-a' },
    { id: 'class-b', name: 'Grade 1', schoolId: 'school-b' },
  ],
  sections: [
    { id: 'sec-1', name: 'A', classId: 'class-1', schoolId: 'school-a' },
    { id: 'sec-2', name: 'B', classId: 'class-2', schoolId: 'school-a' },
    { id: 'sec-b', name: 'A', classId: 'class-b', schoolId: 'school-b' },
  ],
  existingAdmissionNos: new Set<string>(),
});

async function sheetFrom(text: string) {
  const file = csvFile(text);
  assertImportFile(file.originalname, file.mimetype, file.buffer);
  return parseImportBuffer(file.originalname, file.buffer);
}

describe('student import template and parsing', () => {
  it('builds a template with instructions, required guidance, and a marked sample row', async () => {
    const buffer = await buildStudentImportTemplate();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const students = workbook.getWorksheet('Students');
    const instructions = workbook.getWorksheet('Instructions');
    assert.ok(students);
    assert.ok(instructions);
    assert.equal(students.getRow(1).getCell(1).value, 'Admission Number');
    assert.equal(students.getRow(1).getCell(2).value, 'Student Name');
    assert.equal(students.getRow(2).getCell(1).value, 'EXAMPLE-001');
    assert.match(String(students.getRow(2).getCell(2).value), /Example Student/);
    const instructionText = instructions.getSheetValues().flat().join(' ');
    assert.match(instructionText, /YYYY-MM-DD/);
    assert.match(instructionText, /Admission Number and Student Name are required/);
    assert.match(instructionText, /section must already belong/i);
    assert.match(instructionText, /never overwritten/i);
    assert.match(instructionText, /cannot move students/i);
  });

  it('parses the template and skips the sample row', async () => {
    const buffer = await buildStudentImportTemplate();
    const sheet = await parseImportBuffer('clever-campus-student-import-template.xlsx', buffer);
    assert.equal(sheet.sheetName, 'Students');
    const mapping = suggestColumnMapping(sheet.headers);
    assert.equal(mapping[0], 'admissionNo');
    assert.equal(mapping[1], 'fullName');
    assert.equal(mapping[9], 'className');
    const rows = validateImportSheet(sheet, mapping, baseCatalog());
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'example');
    assert.equal(rows[0].normalized, undefined);
  });

  it('reads a real xlsx data sheet instead of the instructions sheet', async () => {
    const workbook = new ExcelJS.Workbook();
    const notes = workbook.addWorksheet('Instructions');
    notes.addRow(['Read me']);
    const students = workbook.addWorksheet('Students');
    students.addRow(['Admission Number', 'Student Name', 'Class', 'Section']);
    students.addRow(['A-10', 'Ayesha Khan', 'Grade 1', 'A']);
    const dateCell = students.getRow(3);
    students.getRow(1);
    students.addRow(['A-11', 'Bilal Khan', 'Grade 1', 'A']);
    students.getCell('G2').value = new Date(Date.UTC(2015, 3, 12));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const sheet = await parseImportBuffer('class-list.xlsx', buffer);
    assert.equal(sheet.sheetName, 'Students');
    assert.equal(sheet.rows[0].cells[1].text, 'Ayesha Khan');
    assert.equal(sheet.rows.length, 2);
    void dateCell;
  });

  it('uses a cached formula result and does not require formula execution', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['Admission Number', 'Student Name']);
    sheet.getCell('A2').value = { formula: '1+1', result: 'A-20' };
    sheet.getCell('B2').value = 'Formula Student';
    sheet.getCell('A3').value = { formula: 'HYPERLINK("http://evil")', result: undefined };
    sheet.getCell('B3').value = 'Unsafe Formula';
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const parsed = await parseImportBuffer('formulas.xlsx', buffer);
    assert.equal(parsed.rows[0].cells[0].text, 'A-20');
    assert.equal(parsed.rows[0].cells[0].formulaError, undefined);
    assert.match(parsed.rows[1].cells[0].formulaError ?? '', /plain value/i);
  });

  it('parses quoted csv values', async () => {
    const sheet = await sheetFrom('Admission Number,Student Name\n"A, 1","Khan, Ali"\n');
    assert.equal(sheet.rows[0].cells[0].text, 'A, 1');
    assert.equal(sheet.rows[0].cells[1].text, 'Khan, Ali');
  });
});

describe('column mapping', () => {
  it('maps recognizable headings and leaves unknown columns undecided', () => {
    const mapping = suggestColumnMapping([
      'Student Name',
      'Father Name',
      'Admission Number',
      'Class',
      'Section',
      'Date of Birth',
      'Gender',
      'Phone',
      'Roll Number',
    ]);
    assert.deepEqual(mapping.slice(0, 8), [
      'fullName',
      'fatherName',
      'admissionNo',
      'className',
      'sectionName',
      'dateOfBirth',
      'gender',
      'guardianPhone',
    ]);
    assert.equal(mapping[8], null);
  });

  it('accepts a corrected manual mapping and blocks missing required columns', () => {
    const headers = ['Kid', 'Papa', 'No'];
    const missing = resolveColumnMapping(headers, null);
    assert.equal(missing.ready, false);
    assert.match(missing.errors.join(' '), /Student Name|Admission Number/);

    const manual = resolveColumnMapping(headers, ['fullName', '__ignore', 'admissionNo']);
    assert.equal(manual.ready, true);
    assert.match(manual.notes.join(' '), /Papa/);
  });

  it('does not offer a school id field and requires an explicit ignore', () => {
    const headers = ['Admission Number', 'Student Name', 'School Id'];
    const suggested = resolveColumnMapping(headers, null);
    assert.equal(suggested.ready, false);
    assert.match(suggested.errors.join(' '), /School Id/);
    const ignored = resolveColumnMapping(headers, ['admissionNo', 'fullName', '__ignore']);
    assert.equal(ignored.ready, true);
    assert.equal(ignored.assignments.includes('schoolId' as never), false);
  });
});

describe('row validation', () => {
  it('accepts a valid row and resolves class and section inside the school', async () => {
    const sheet = await sheetFrom(
      'Admission Number,Student Name,Father Name,Class,Section,Gender,Date of Birth,Monthly Fee,Fee Status\n' +
        'A-1,  Ali   Khan ,Example Father,grade 1,a,boy,12/04/2015,"1,500",paid\n',
    );
    const mapping = suggestColumnMapping(sheet.headers);
    const [row] = validateImportSheet(sheet, mapping, baseCatalog());
    assert.equal(row.status, 'valid');
    assert.equal(row.normalized?.fullName, 'Ali Khan');
    assert.equal(row.normalized?.classId, 'class-1');
    assert.equal(row.normalized?.sectionId, 'sec-1');
    assert.equal(row.normalized?.gender, 'MALE');
    assert.equal(row.normalized?.dateOfBirth, '2015-04-12');
    assert.equal(row.normalized?.monthlyFee, 1500);
    assert.equal(row.normalized?.feeStatus, 'PAID');
    assert.equal((row.normalized as { schoolId?: string }).schoolId, undefined);
  });

  it('reports invalid dates, enums, class, and section compatibility with the excel row number', async () => {
    const sheet = await sheetFrom(
      'Admission Number,Student Name,Class,Section,Gender,Date of Birth,Status,Monthly Fee\n' +
        'A-2,Sara,Missing Class,A,unknown,31/02/2015,left,10.5\n' +
        'A-3,Omar,Grade 1,B,FEMALE,2015-04-12,ACTIVE,0\n',
    );
    const rows = validateImportSheet(sheet, suggestColumnMapping(sheet.headers), baseCatalog());
    assert.equal(rows[0].rowNumber, 2);
    assert.equal(rows[0].status, 'error');
    const messages = rows[0].errors.map((issue) => `${issue.field}: ${issue.message}`).join(' | ');
    assert.match(messages, /Gender/);
    assert.match(messages, /real calendar date|Date of birth/);
    assert.match(messages, /Missing Class/);
    assert.match(messages, /Monthly fee/);
    assert.match(messages, /Status/);
    assert.equal(rows[1].status, 'error');
    assert.match(rows[1].errors.map((issue) => issue.message).join(' '), /does not belong to class/);
  });

  it('skips in-file duplicates and database duplicates without treating the name as identity', async () => {
    const sheet = await sheetFrom(
      'Admission Number,Student Name\nA-1,Same Name\nA-1,Same Name\nA-2,Same Name\nA-9,Already There\n',
    );
    const catalog = baseCatalog();
    catalog.existingAdmissionNos.add('A-9');
    const rows = validateImportSheet(sheet, suggestColumnMapping(sheet.headers), catalog);
    assert.equal(rows[0].status, 'valid');
    assert.equal(rows[1].status, 'duplicate');
    assert.equal(rows[1].duplicate?.source, 'file');
    assert.equal(rows[1].duplicate?.field, 'admissionNo');
    assert.equal(rows[1].duplicate?.relatedRow, 2);
    assert.equal(rows[2].status, 'valid');
    assert.equal(rows[2].normalized?.fullName, 'Same Name');
    assert.equal(rows[3].status, 'duplicate');
    assert.equal(rows[3].duplicate?.source, 'database');
    assert.match(rows[3].duplicate?.message ?? '', /not changed/);
  });

  it('ignores classes and sections that belong to another school', async () => {
    const sheet = await sheetFrom('Admission Number,Student Name,Class,Section\nA-5,Hina,Grade 1,A\n');
    const catalog = baseCatalog();
    catalog.classes = catalog.classes.filter((item) => item.schoolId !== 'school-a');
    catalog.sections = catalog.sections.filter((item) => item.schoolId !== 'school-a');
    const [row] = validateImportSheet(sheet, suggestColumnMapping(sheet.headers), catalog);
    assert.equal(row.status, 'error');
    assert.match(row.errors.map((issue) => issue.message).join(' '), /not found in this school/);
    assert.equal(row.normalized, undefined);
  });

  it('parses supported dates and rejects impossible ones', () => {
    assert.equal((parseImportDate('2015-04-12') as { iso: string }).iso, '2015-04-12');
    assert.equal((parseImportDate('12/04/2015') as { iso: string }).iso, '2015-04-12');
    assert.equal('error' in parseImportDate('31/02/2015'), true);
    assert.equal('error' in parseImportDate('yesterday'), true);
  });
});

describe('file safety', () => {
  it('rejects empty, malformed, legacy excel, and oversized files', async () => {
    await assert.rejects(
      async () => parseReady('', 'empty.csv'),
      (error: any) => error instanceof BadRequestException && /empty/i.test(error.message),
    );
    await assert.rejects(
      async () => parseReady('"unterminated', 'bad.csv'),
      (error: any) => error instanceof BadRequestException && /malformed/i.test(error.message),
    );
    await assert.rejects(
      async () => parseReady('name', 'students.xls'),
      (error: any) => error instanceof BadRequestException && /not supported/i.test(error.message),
    );
    const big = Buffer.alloc(MAX_IMPORT_BYTES + 1, 0x41);
    await assert.rejects(
      async () => assertImportFile('students.csv', 'text/csv', big),
      (error: any) => error instanceof BadRequestException && /5 MB/.test(error.message),
    );
    await assert.rejects(
      async () => assertImportFile('students.xlsx', 'application/octet-stream', Buffer.from('not-a-zip')),
      (error: any) => error instanceof BadRequestException && /not a valid Excel/i.test(error.message),
    );
  });

  it('rejects too many student rows', async () => {
    const lines = ['Admission Number,Student Name'];
    for (let index = 0; index < MAX_IMPORT_ROWS + 1; index++) lines.push(`N-${index},Student ${index}`);
    await assert.rejects(
      async () => parseReady(lines.join('\n'), 'too-many.csv'),
      (error: any) => error instanceof BadRequestException && /too many rows/i.test(error.message),
    );
  });

  it('rejects unsafe workbook entries and escapes formula text in the error report', () => {
    assert.throws(() => assertXlsxArchiveSafe(zipWithName('../secret.txt')), /unsafe file entry/);
    assert.throws(() => assertXlsxArchiveSafe(zipWithName('xl/vbaProject.bin')), /Macro-enabled/);
    assert.doesNotThrow(() => assertXlsxArchiveSafe(zipWithName('xl/worksheets/sheet1.xml')));
    const csv = buildErrorReportCsv([
      {
        rowNumber: 4,
        status: 'error',
        values: { admissionNo: '=1+1', fullName: '@cmd' },
        errors: [{ field: 'admissionNo', message: 'Admission number is required.' }],
        warnings: [],
      },
    ]);
    assert.match(csv, /'=1\+1/);
    assert.match(csv, /'@cmd/);
    assert.match(escapeCsvCell('=HYPERLINK("http://evil")'), /'=HYPERLINK/);
  });
});

describe('import authorization and persistence', () => {
  it('allows school admin and receptionist and denies teachers and other roles', () => {
    for (const method of ['downloadImportTemplate', 'previewImport', 'commitImport'] as const) {
      const roles = rolesOn(method);
      assert.ok(roles.includes(UserRole.SCHOOL_ADMIN), method);
      assert.ok(roles.includes(UserRole.RECEPTIONIST), method);
      assert.ok(roles.includes(UserRole.SUPER_ADMIN), method);
      assert.equal(roles.includes(UserRole.TEACHER), false, method);
      assert.equal(roles.includes(UserRole.ACCOUNTANT), false, method);
      assert.equal(guardAllows(roles, UserRole.TEACHER), false);
      assert.equal(guardAllows(roles, UserRole.SCHOOL_ADMIN), true);
    }
    const createRoles = rolesOn('create');
    assert.ok(createRoles.includes(UserRole.SCHOOL_ADMIN));
    assert.equal(createRoles.includes(UserRole.TEACHER), false);
  });

  it('keeps single-student create rejecting duplicates and still notifying', async () => {
    let created = false;
    const duplicatePrisma = {
      student: { findUnique: async () => ({ id: 'existing' }) },
      $transaction: async () => {
        created = true;
      },
    };
    const duplicateService = new StudentsService(
      duplicatePrisma as any,
      { dispatch: () => { throw new Error('should not notify'); } } as any,
      { log: async () => {} } as any,
      {} as any,
    );
    await assert.rejects(
      () => duplicateService.create({ admissionNo: 'A-1', fullName: 'Kept Student' }, admin),
      (error: any) => /already exists/.test(error.message),
    );
    assert.equal(created, false);

    let dispatched = false;
    let audited = false;
    const tx = {
      student: {
        create: async () => ({
          id: 's1',
          schoolId: 'school-a',
          fullName: 'New Student',
          admissionNo: 'N-1',
          monthlyFee: 0,
          fatherName: null,
        }),
      },
    };
    const createService = new StudentsService(
      {
        student: { findUnique: async () => null },
        $transaction: async (fn: any) => fn(tx),
      } as any,
      { dispatch: () => { dispatched = true; } } as any,
      { log: async () => { audited = true; } } as any,
      { applyAdmissionFee: async () => {} } as any,
    );
    const student = await createService.create({ admissionNo: 'N-1', fullName: 'New Student' }, admin);
    assert.equal(student.admissionNo, 'N-1');
    assert.equal(dispatched, true);
    assert.equal(audited, true);
  });

  it('previews without writing and refuses another school id', async () => {
    const harness = buildHarness();
    const service = harness.service;
    const preview = await service.preview(
      csvFile('Admission Number,Student Name,Class,Section\nA-1,Ali Khan,Grade 1,A\n'),
      null,
      admin,
    );
    assert.equal(preview.readyToImport, true);
    assert.equal(preview.validCount, 1);
    assert.equal(harness.creates.length, 0);
    assert.equal(harness.notifications, 0);
    assert.deepEqual(harness.schoolFilters, ['school-a']);

    await assert.rejects(
      () => service.preview(csvFile('Admission Number,Student Name\nA-1,Ali\n'), null, admin, 'school-b'),
      (error: any) => error instanceof ForbiddenException,
    );
    const superAdmin: CurrentUser = { ...admin, role: UserRole.SUPER_ADMIN, schoolId: null };
    await assert.rejects(
      () => service.preview(csvFile('Admission Number,Student Name\nA-1,Ali\n'), null, superAdmin),
      (error: any) => error instanceof BadRequestException && /schoolId is required/.test(error.message),
    );
  });

  it('imports only the authenticated school and skips database duplicates on retry', async () => {
    const harness = buildHarness();
    const file = csvFile(
      'Admission Number,Student Name,Father Name,Class,Section,School Id\n' +
        'A-1,Ali Khan,Father Ali,Grade 1,A,school-b\n' +
        'A-2,Hina Noor,Father Hina,Grade 1,A,school-b\n',
    );
    const mapping = ['admissionNo', 'fullName', 'fatherName', 'className', 'sectionName', '__ignore'];
    const first = await harness.service.commit(file, mapping, admin);
    assert.equal(first.created, 2);
    assert.equal(first.skippedDuplicates, 0);
    assert.ok(harness.creates.every((row) => row.schoolId === 'school-a'));
    assert.ok(harness.parentSchools.every((schoolId) => schoolId === 'school-a'));
    assert.equal(harness.notifications, 0);
    assert.equal(harness.audit?.details.created, 2);
    assert.equal(JSON.stringify(harness.audit).includes('Ali Khan'), false);

    harness.existing.add('A-1');
    harness.existing.add('A-2');
    const retry = await harness.service.preview(file, mapping, admin);
    assert.equal(retry.duplicateCount, 2);
    assert.equal(retry.readyToImport, false);
    await assert.rejects(() => harness.service.commit(file, mapping, admin), /No valid students/);
    assert.equal(harness.creates.length, 2);
  });

  it('saves valid rows when other rows are invalid and hides database errors', async () => {
    const harness = buildHarness({ failBatches: true });
    const file = csvFile(
      'Admission Number,Student Name,Class\nA-1,Ali Khan,Grade 1\nA-2,Broken,Missing\nA-1,Ali Again,Grade 1\n',
    );
    const result = await harness.service.commit(file, null, admin);
    assert.equal(result.created, 1);
    assert.equal(result.failed, 1);
    assert.ok(result.skippedDuplicates >= 1);
    assert.equal(JSON.stringify(result).includes('secret-token'), false);
    assert.match(result.errorReportCsv, /Missing/);
  });

  it('turns a transaction failure into a safe row error and still retries row by row', async () => {
    const harness = buildHarness({ explode: true });
    const file = csvFile('Admission Number,Student Name\nA-8,Safe Student\n');
    const result = await harness.service.commit(file, null, admin);
    assert.equal(result.created, 0);
    assert.equal(result.failed, 1);
    assert.equal(JSON.stringify(result).includes('secret-token'), false);
    assert.match(result.issues[0]?.errors[0]?.message ?? '', /could not be saved/i);
    assert.equal(publicImportError(new Error('secret-token')).includes('secret'), false);
  });
});

function parseReady(text: string, name: string) {
  const file = csvFile(text, name);
  assertImportFile(file.originalname, file.mimetype, file.buffer);
  return parseImportBuffer(file.originalname, file.buffer);
}

function buildHarness(options?: { failBatches?: boolean; explode?: boolean }) {
  const creates: { schoolId: string; admissionNo: string }[] = [];
  const parentSchools: string[] = [];
  const schoolFilters: string[] = [];
  const existing = new Set<string>();
  let notifications = 0;
  let audit: { details: { created: number } } | null = null;
  let transactions = 0;

  const tx = {
    student: {
      findUnique: async ({ where }: any) => {
        const admissionNo = where.schoolId_admissionNo?.admissionNo;
        if (existing.has(admissionNo)) return { id: 'exists' };
        return null;
      },
      create: async ({ data }: any) => {
        creates.push({ schoolId: data.schoolId, admissionNo: data.admissionNo });
        return {
          id: `stu-${creates.length}`,
          schoolId: data.schoolId,
          admissionNo: data.admissionNo,
          fullName: data.fullName,
          fatherName: data.fatherName,
          guardianPhone: data.guardianPhone,
          address: data.address,
          monthlyFee: data.monthlyFee ?? 0,
        };
      },
    },
    parent: {
      findMany: async () => [],
      create: async ({ data }: any) => {
        parentSchools.push(data.schoolId);
        return data;
      },
    },
  };

  const prisma = {
    class: {
      findMany: async ({ where }: any) => {
        schoolFilters.push(where.schoolId);
        if (where.schoolId !== 'school-a') return [];
        return [
          { id: 'class-1', name: 'Grade 1', schoolId: 'school-a' },
          { id: 'class-2', name: 'Grade 2', schoolId: 'school-a' },
        ];
      },
      findUnique: async ({ where }: any) =>
        where.id === 'class-1' || where.id === 'class-2'
          ? { id: where.id, schoolId: 'school-a' }
          : null,
    },
    section: {
      findMany: async ({ where }: any) => {
        if (where.schoolId !== 'school-a') return [];
        return [
          { id: 'sec-1', name: 'A', classId: 'class-1', schoolId: 'school-a' },
          { id: 'sec-2', name: 'B', classId: 'class-2', schoolId: 'school-a' },
        ];
      },
      findUnique: async ({ where }: any) =>
        where.id === 'sec-1'
          ? { id: 'sec-1', schoolId: 'school-a', classId: 'class-1' }
          : where.id === 'sec-2'
            ? { id: 'sec-2', schoolId: 'school-a', classId: 'class-2' }
            : null,
    },
    student: {
      findMany: async ({ where }: any) => {
        assert.equal(where.schoolId, 'school-a');
        return [...existing].filter((admissionNo) => where.admissionNo.in.includes(admissionNo)).map((admissionNo) => ({ admissionNo }));
      },
    },
    $transaction: async (fn: any) => {
      transactions += 1;
      if (options?.explode) throw new Error('db down secret-token');
      if (options?.failBatches && transactions === 1) throw new Error('batch failed secret-token');
      return fn(tx);
    },
  };

  const students = new StudentsService(
    prisma as any,
    { dispatch: () => { notifications += 1; } } as any,
    { log: async () => {} } as any,
    { applyAdmissionFee: async () => {} } as any,
  );
  const service = new StudentImportService(prisma as any, students, {
    log: async (entry: any) => {
      audit = entry;
    },
  } as any);

  return { service, creates, parentSchools, schoolFilters, existing, get notifications() { return notifications; }, get audit() { return audit; } };
}

function zipWithName(name: string, uncompressed = 2): Buffer {
  const nameBuf = Buffer.from(name);
  const data = Buffer.from('hi');
  const local = Buffer.alloc(30 + nameBuf.length + data.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  nameBuf.copy(local, 30);
  data.copy(local, 30 + nameBuf.length);

  const directory = Buffer.alloc(46 + nameBuf.length);
  directory.writeUInt32LE(0x02014b50, 0);
  directory.writeUInt16LE(20, 4);
  directory.writeUInt16LE(20, 6);
  directory.writeUInt32LE(uncompressed, 24);
  directory.writeUInt16LE(nameBuf.length, 28);
  directory.writeUInt32LE(0, 42);
  nameBuf.copy(directory, 46);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, directory, end]);
}
