import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class IssueBookDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsNotEmpty()
  @IsString()
  bookId: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsNotEmpty()
  @IsString()
  issuedToName: string;

  @IsNotEmpty()
  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
