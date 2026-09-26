import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TeacherPunchDto {
  @ApiProperty({ description: 'Teacher profile id to punch' })
  @IsString()
  @IsNotEmpty()
  teacherId: string;

  @ApiPropertyOptional({
    description: 'Required for SUPER_ADMIN when punching on behalf of a school teacher',
  })
  @IsOptional()
  @IsString()
  schoolId?: string;
}
