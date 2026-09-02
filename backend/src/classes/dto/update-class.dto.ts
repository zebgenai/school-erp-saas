import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OptionalRelationId } from '../../common/decorators/id-validation.decorator';

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Class name cannot be empty' })
  name?: string;

  @OptionalRelationId('Class teacher')
  classTeacherId?: string | null;
}
