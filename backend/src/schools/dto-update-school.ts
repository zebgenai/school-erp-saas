import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { IdCardTemplate } from '@prisma/client';

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  themeColor?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  emailNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsNotificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  whatsappNotificationsEnabled?: boolean;

  @IsOptional()
  @IsEnum(IdCardTemplate)
  idCardTemplate?: IdCardTemplate;

  @IsOptional()
  @IsString()
  @Matches(/^$|^[A-Za-z0-9_+\-/]+$/, { message: 'Use an IANA timezone id (e.g. Asia/Karachi)' })
  timezone?: string;

  @IsOptional()
  @Matches(/^$|^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Use HH:mm (24-hour) or leave empty' })
  attendancePresentUntil?: string;

  @IsOptional()
  @Matches(/^$|^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Use HH:mm (24-hour) or leave empty' })
  attendanceLateUntil?: string;
}
