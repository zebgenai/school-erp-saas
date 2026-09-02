import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OptionalRelationId } from '../../common/decorators/id-validation.decorator';

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Section name cannot be empty' })
  name?: string;

  @OptionalRelationId('Section teacher')
  teacherId?: string | null;
}
