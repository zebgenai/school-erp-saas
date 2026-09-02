import { IsDateString, IsOptional, IsString } from 'class-validator';

export class MarkPaidDto {
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
