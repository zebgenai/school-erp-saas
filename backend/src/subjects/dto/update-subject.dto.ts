import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OptionalRelationId } from '../../common/decorators/id-validation.decorator';

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Subject name cannot be empty' })
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @OptionalRelationId('Class')
  classId?: string | null;

  @OptionalRelationId('Section')
  sectionId?: string | null;

  @OptionalRelationId('Teacher')
  teacherId?: string | null;
}
