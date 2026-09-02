import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OptionalRelationId } from '../../common/decorators/id-validation.decorator';

export class CreateClassDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @OptionalRelationId('Class teacher')
  classTeacherId?: string | null;

  @IsOptional()
  @IsString()
  schoolId?: string;
}
