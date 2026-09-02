import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/** Upper bound on one archive request so a single call cannot render unbounded PDFs. */
export const MAX_ARCHIVE_INVOICES = 500;

export class InvoiceArchiveDto {
  @ApiProperty({
    description: 'Invoices to include in the archive, typically the ids returned by bulk generation',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'invoiceIds must contain at least one invoice' })
  @ArrayMaxSize(MAX_ARCHIVE_INVOICES, {
    message: `A maximum of ${MAX_ARCHIVE_INVOICES} invoices can be archived at once`,
  })
  @IsUUID('4', { each: true })
  invoiceIds: string[];
}
