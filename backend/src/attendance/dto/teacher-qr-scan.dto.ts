import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Teacher QR attendance is school-staff only.
 * Tenant comes from the authenticated user's schoolId — never from the QR token.
 * Identity comes from the TCC1 token → TeacherIdCard — never from a client teacherId.
 */
export class TeacherQrScanDto {
  @ApiProperty({ example: 'TCC1.xxxxxxxx', description: 'Teacher ID card QR token' })
  @IsString()
  @IsNotEmpty()
  qrToken: string;

  /** Alias accepted for scanners that already post `{ token }`. Prefer `qrToken`. */
  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  token?: string;
}
