import { IsObject, IsString } from 'class-validator';

export class UpdateRolePermissionsDto {
  @IsString()
  role!: string;

  @IsObject()
  permissions!: Record<string, boolean>;
}
