import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SchoolAuditService } from '../../audit-logs/school-audit.service';
import { CurrentUser } from '../../common/types/current-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentsService } from '../students.service';
import { DuplicateAdmissionError, ImportBatchFallback, publicImportError } from './student-import.errors';
import { fieldCatalog, resolveColumnMapping, suggestColumnMapping } from './student-import.fields';
import { assertImportFile, parseImportBuffer, safeUploadName } from './student-import.parse';
import { assignmentsForClient, buildErrorReportCsv, duplicatePolicy, presentRow } from './student-import.report';
import { buildStudentImportTemplate } from './student-import.template';
import {
  ColumnAssignment,
  IMPORT_BATCH_SIZE,
  ISSUE_PREVIEW_LIMIT,
  ImportRowOutcome,
  PREVIEW_ROW_LIMIT,
  UploadedImportFile,
} from './student-import.types';
import { countOutcomes, validateImportSheet } from './student-import.validate';

@Injectable()
export class StudentImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly students: StudentsService,
    private readonly schoolAudit: SchoolAuditService,
  ) {}

  template(): Promise<Buffer> {
    return buildStudentImportTemplate();
  }

  async preview(
    file: UploadedImportFile | undefined,
    mapping: unknown,
    currentUser: CurrentUser,
    requestedSchoolId?: string,
  ) {
    const schoolId = this.students.resolveWritableSchoolId(currentUser, requestedSchoolId);
    const prepared = await this.prepare(file, mapping, schoolId);
    return this.describe(file, prepared, {
      created: 0,
      skippedDuplicates: prepared.counts.duplicateCount,
      failed: prepared.counts.errorCount,
      feeWarnings: [],
      createdSample: [],
    });
  }

  async commit(
    file: UploadedImportFile | undefined,
    mapping: unknown,
    currentUser: CurrentUser,
    requestedSchoolId?: string,
  ) {
    const schoolId = this.students.resolveWritableSchoolId(currentUser, requestedSchoolId);
    const prepared = await this.prepare(file, mapping, schoolId);
    if (!prepared.mapping.ready) {
      throw new BadRequestException(
        prepared.mapping.errors[0] || 'Map the required columns before importing.',
      );
    }
    if (prepared.counts.validCount === 0) {
      throw new BadRequestException('No valid students to import. Correct the file and upload it again.');
    }

    const valid = prepared.rows.filter((row) => row.status === 'valid' && row.normalized);
    let created = 0;
    let skippedDuplicates = prepared.counts.duplicateCount;
    let failed = prepared.counts.errorCount;
    const feeWarnings: { rowNumber: number; message: string }[] = [];
    const createdSample: string[] = [];
    const writeProblems: ImportRowOutcome[] = [];

    for (let index = 0; index < valid.length; index += IMPORT_BATCH_SIZE) {
      const group = valid.slice(index, index + IMPORT_BATCH_SIZE);
      const writes = group.map((row) => row.normalized!);
      let saved: { admissionNo: string; feeWarning?: string }[] | null = null;
      try {
        saved = await this.students.createImportedMany(schoolId, writes, currentUser);
      } catch (error) {
        if (error instanceof ForbiddenException) throw error;
        if (!(error instanceof ImportBatchFallback)) {
          saved = null;
        }
      }

      if (saved) {
        saved.forEach((item, itemIndex) => {
          created += 1;
          if (createdSample.length < 10) createdSample.push(item.admissionNo);
          if (item.feeWarning) {
            feeWarnings.push({ rowNumber: group[itemIndex].rowNumber, message: item.feeWarning });
          }
        });
        continue;
      }

      for (const row of group) {
        try {
          const item = await this.students.createImported(schoolId, row.normalized!, currentUser);
          created += 1;
          if (createdSample.length < 10) createdSample.push(item.admissionNo);
          if (item.feeWarning) feeWarnings.push({ rowNumber: row.rowNumber, message: item.feeWarning });
        } catch (error) {
          if (error instanceof ForbiddenException) throw error;
          if (error instanceof DuplicateAdmissionError) {
            skippedDuplicates += 1;
            writeProblems.push({
              rowNumber: row.rowNumber,
              status: 'duplicate',
              values: row.values,
              errors: [],
              warnings: row.warnings,
              duplicate: {
                field: 'admissionNo',
                source: 'database',
                message: 'Admission number already exists in this school. The existing student was not changed.',
              },
            });
          } else {
            failed += 1;
            writeProblems.push({
              rowNumber: row.rowNumber,
              status: 'error',
              values: row.values,
              errors: [{ field: 'admissionNo', message: publicImportError(error) }],
              warnings: row.warnings,
            });
          }
        }
      }
    }

    if (created > 0 || skippedDuplicates > 0 || failed > 0) {
      try {
        await this.schoolAudit.log({
          schoolId,
          userId: currentUser.id,
          actorName: currentUser.name,
          action: 'STUDENTS_IMPORTED',
          entity: 'Student',
          description: `Bulk import created ${created} students, skipped ${skippedDuplicates} duplicates, and rejected ${failed} rows.`,
          details: { created, skippedDuplicates, failed, totalRows: prepared.counts.totalRows },
          dedupeKey: `audit:students-imported:${currentUser.id}:${Date.now()}:${randomBytes(3).toString('hex')}`,
        });
      } catch {
        // The student rows are already saved. An audit failure must not hide that result.
      }
    }

    const reported = [
      ...prepared.rows.filter((row) => row.status !== 'valid'),
      ...writeProblems,
    ];
    return this.describe(file, { ...prepared, rows: reported }, {
      created,
      skippedDuplicates,
      failed,
      feeWarnings,
      createdSample,
    });
  }

  private async prepare(file: UploadedImportFile | undefined, mapping: unknown, schoolId: string) {
    if (!file?.buffer) {
      throw new BadRequestException('Choose an Excel or CSV file to upload.');
    }
    const filename = safeUploadName(file.originalname);
    assertImportFile(filename, file.mimetype, file.buffer);
    const sheet = await parseImportBuffer(filename, file.buffer);
    const resolved = resolveColumnMapping(sheet.headers, mapping);
    const catalog = resolved.ready ? await this.loadCatalog(schoolId, sheet, resolved.assignments) : null;
    const rows = catalog ? validateImportSheet(sheet, resolved.assignments, catalog) : [];
    return {
      filename,
      sheet,
      mapping: resolved,
      suggested: suggestColumnMapping(sheet.headers),
      rows,
      counts: countOutcomes(rows),
    };
  }

  private async loadCatalog(
    schoolId: string,
    sheet: { headers: string[]; rows: { cells: { text: string }[] }[] },
    assignments: ColumnAssignment[],
  ) {
    const admissionIndex = assignments.findIndex((value) => value === 'admissionNo');
    const admissionNos = [
      ...new Set(
        sheet.rows
          .map((row) => (admissionIndex >= 0 ? row.cells[admissionIndex]?.text ?? '' : '').trim())
          .filter((value) => value.length > 0),
      ),
    ];

    const [classes, sections, existing] = await Promise.all([
      this.prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, schoolId: true },
      }),
      this.prisma.section.findMany({
        where: { schoolId },
        select: { id: true, name: true, classId: true, schoolId: true },
      }),
      admissionNos.length
        ? this.prisma.student.findMany({
            where: { schoolId, admissionNo: { in: admissionNos.slice(0, 3000) } },
            select: { admissionNo: true },
          })
        : Promise.resolve([]),
    ]);

    return {
      schoolId,
      classes,
      sections,
      existingAdmissionNos: new Set(existing.map((student) => student.admissionNo)),
    };
  }

  private describe(
    file: UploadedImportFile | undefined,
    prepared: Awaited<ReturnType<StudentImportService['prepare']>>,
    result: {
      created: number;
      skippedDuplicates: number;
      failed: number;
      feeWarnings: { rowNumber: number; message: string }[];
      createdSample: string[];
    },
  ) {
    const issueRows = prepared.rows.filter((row) => row.status !== 'valid');
    const previewRows = prepared.rows.slice(0, PREVIEW_ROW_LIMIT).map(presentRow);
    return {
      fileName: prepared.filename,
      fileSize: file?.size ?? file?.buffer.length ?? 0,
      sheetName: prepared.sheet.sheetName,
      headers: prepared.sheet.headers,
      fields: fieldCatalog(),
      suggestedMapping: assignmentsForClient(prepared.suggested),
      mapping: assignmentsForClient(prepared.mapping.assignments),
      mappingErrors: prepared.mapping.errors,
      mappingNotes: prepared.mapping.notes,
      mappingReady: prepared.mapping.ready,
      readyToImport: prepared.mapping.ready && prepared.counts.validCount > 0,
      duplicatePolicy: duplicatePolicy(),
      notes: [
        ...prepared.sheet.notes,
        'A blank admission date uses today. Dates use YYYY-MM-DD.',
        'Class and section must already exist in this school. Section must belong to the class.',
        duplicatePolicy(),
        ...prepared.mapping.notes,
      ],
      totalRows: prepared.counts.totalRows,
      blankRowsSkipped: prepared.sheet.blankRowsSkipped,
      validCount: prepared.counts.validCount,
      errorCount: prepared.counts.errorCount,
      duplicateCount: prepared.counts.duplicateCount,
      exampleCount: prepared.counts.exampleCount,
      warningCount: prepared.counts.warningCount,
      created: result.created,
      skippedDuplicates: result.skippedDuplicates,
      failed: result.failed,
      feeWarnings: result.feeWarnings,
      createdSample: result.createdSample,
      previewRows,
      previewTruncated: prepared.rows.length > previewRows.length,
      issues: issueRows.slice(0, ISSUE_PREVIEW_LIMIT).map(presentRow),
      issuesTruncated: issueRows.length > ISSUE_PREVIEW_LIMIT,
      errorReportCsv: buildErrorReportCsv(prepared.rows),
    };
  }
}
