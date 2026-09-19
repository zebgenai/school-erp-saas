import { IdCardTemplate } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export const MAX_ID_CARDS_BATCH = 200;

export class PreviewIdCardsDto {
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

  /** School-wide active students (authenticated school only). Batched via cursor. */
  @IsOptional()
  @IsBoolean()
  allActive?: boolean;

  /** Pagination cursor (student id) for allActive / large batches. */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsEnum(IdCardTemplate)
  template?: IdCardTemplate;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @IsOptional()
  @IsString()
  schoolId?: string;
}
