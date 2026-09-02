import { UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
