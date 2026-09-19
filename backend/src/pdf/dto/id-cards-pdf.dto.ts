import { IdCardTemplate } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { MAX_ID_CARDS_BATCH } from '../../id-cards/dto/preview-id-cards.dto';

/**
 * PDF selection mirrors ID-card preview filters.
 * `allActive` is school-scoped via JWT (Super Admin must pass schoolId).
 * Large selections are batched internally by PdfService (not by the browser).
 */
export class IdCardsPdfDto {
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ID_CARDS_BATCH)
  @IsString({ each: true })
  studentIds?: string[];

  /** School-wide active students (authenticated school only). */
  @IsOptional()
  @IsBoolean()
  allActive?: boolean;

  /**
   * Optional start cursor for allActive / large class batches.
   * Callers normally omit this; PdfService walks pages internally.
   */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(IdCardTemplate)
  template?: IdCardTemplate;

  @IsOptional()
  @IsString()
  schoolId?: string;
}
