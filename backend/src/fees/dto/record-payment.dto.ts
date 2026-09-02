import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class RecordPaymentDto {
  @IsString()
  @IsNotEmpty()
  invoiceId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
