import { IdCardTemplate } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { MAX_ID_CARDS_BATCH } from './preview-id-cards.dto';

export class PreviewTeacherIdCardsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ID_CARDS_BATCH)
  @IsString({ each: true })
  teacherIds?: string[];

  /** School-wide active teachers (authenticated school only). Batched via cursor. */
  @IsOptional()
  @IsBoolean()
  allActive?: boolean;

  /** Pagination cursor (teacher id) for allActive / large batches. */
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
