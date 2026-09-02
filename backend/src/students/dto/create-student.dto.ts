import {
    IsDateString,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Min,
  } from 'class-validator';
  import { OptionalRelationId } from '../../common/decorators/id-validation.decorator';
  
  export class CreateStudentDto {
    @IsString()
    admissionNo: string;
  
    @IsOptional()
    @IsDateString()
    admissionDate?: string;
  
    @IsString()
    fullName: string;
  
    @IsOptional()
    @IsString()
    fatherName?: string;
  
    @IsOptional()
    @IsString()
    guardianPhone?: string;
  
    @IsOptional()
    @IsString()
    whatsappNumber?: string;
  
    @IsOptional()
    @IsString()
    gender?: string;
  
    @IsOptional()
    @IsDateString()
    dateOfBirth?: string;
  
    @IsOptional()
    @IsString()
    address?: string;
  
    @IsOptional()
    @IsString()
    photoUrl?: string;
  
    @OptionalRelationId('Class')
    classId?: string | null;
  
    @OptionalRelationId('Section')
    sectionId?: string | null;
  
    @IsOptional()
    @IsInt({ message: 'Monthly fee must be a whole number' })
    @Min(0, { message: 'Monthly fee cannot be negative' })
    monthlyFee?: number;

    /** Current-month invoice status. Creates that invoice when a monthly fee is set. */
    @IsOptional()
    @IsIn(['PAID', 'UNPAID'], { message: 'Fee status must be Paid or Unpaid' })
    feeStatus?: 'PAID' | 'UNPAID';
  
    @IsOptional()
    @IsString()
    status?: string;
  
    @IsOptional()
    @IsString()
    schoolId?: string;
  }