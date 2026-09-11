import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSchoolDto {
  @IsString()
  @MinLength(2)
  name: string;

  /** Ignored on create; slug is generated from `name`. Kept for older API clients. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  slug?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  domain?: string;

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
}
