import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  OptionalRelationId,
  RequiredRelationId,
} from '../../common/decorators/id-validation.decorator';

export class CreateSectionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @RequiredRelationId('Class')
  classId: string;

  @OptionalRelationId('Section teacher')
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  schoolId?: string;
}
