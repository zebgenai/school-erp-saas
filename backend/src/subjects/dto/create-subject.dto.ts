import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OptionalRelationId } from '../../common/decorators/id-validation.decorator';

export class CreateSubjectDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  code?: string;

  @OptionalRelationId('Class')
  classId?: string | null;

  @OptionalRelationId('Section')
  sectionId?: string | null;

  @OptionalRelationId('Teacher')
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  schoolId?: string;
}
