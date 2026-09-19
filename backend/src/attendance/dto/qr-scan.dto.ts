import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * QR attendance is school-staff only.
 * Tenant comes from the authenticated user's schoolId — never from the QR token.
 * SUPER_ADMIN cannot call this endpoint (see AttendanceController roles).
 */
export class QrScanDto {
  @ApiProperty({ example: 'CC1.xxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
