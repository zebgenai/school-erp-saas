import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';

/** Raised when an admission number already exists for the school. Never overwrites. */
export class DuplicateAdmissionError extends Error {
  readonly field = 'admissionNo';

  constructor() {
    super('Student with this admission number already exists in the school');
    this.name = 'DuplicateAdmissionError';
  }
}

/** A multi-row transaction could not be committed. Callers retry one row at a time. */
export class ImportBatchFallback extends Error {
  constructor() {
    super('import-batch-fallback');
    this.name = 'ImportBatchFallback';
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}

/** User-facing row error. Database messages and stack traces stay internal. */
export function publicImportError(error: unknown): string {
  if (error instanceof DuplicateAdmissionError) return error.message;
  if (
    error instanceof BadRequestException ||
    error instanceof NotFoundException ||
    error instanceof ForbiddenException
  ) {
    return httpMessage(error);
  }
  if (error instanceof HttpException && error.getStatus() < 500) {
    return httpMessage(error);
  }
  return 'This row could not be saved. No existing student was changed.';
}

function httpMessage(error: HttpException): string {
  const body = error.getResponse();
  const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;
  if (Array.isArray(message)) return message.map(String).join(', ');
  if (typeof message === 'string' && message.trim()) return message;
  return 'This row could not be saved. No existing student was changed.';
}
