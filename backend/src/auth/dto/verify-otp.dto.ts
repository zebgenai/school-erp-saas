import { IsUUID, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsUUID()
  challengeId: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from your email' })
  code: string;
}
