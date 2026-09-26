import { IdCardTemplate } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { MAX_ID_CARDS_BATCH } from '../../id-cards/dto/preview-id-cards.dto';

export class TeacherIdCardsPdfDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ID_CARDS_BATCH)
  @IsString({ each: true })
  teacherIds?: string[];

  /** School-wide active teachers (authenticated school only). */
  @IsOptional()
  @IsBoolean()
  allActive?: boolean;

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
