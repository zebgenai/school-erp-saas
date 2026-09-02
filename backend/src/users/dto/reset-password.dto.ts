import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/password.validator';

export class ResetPasswordDto {
  @IsString()
  @IsStrongPassword()
  newPassword: string;

  @IsOptional()
  @IsBoolean()
  forceChange?: boolean;
}
