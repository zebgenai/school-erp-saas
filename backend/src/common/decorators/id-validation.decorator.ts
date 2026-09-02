import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

/**
 * HTML `<select>` elements submit "" for their placeholder option. Left untouched that
 * empty string passes `@IsString()` and reaches Prisma as a foreign key, which fails with
 * an unhandled constraint error (HTTP 500) instead of a validation message. Normalising it
 * to null keeps "no selection" and "clear the selection" expressible on optional relations.
 */
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** Optional relation id. Accepts undefined/null/"" as "not set"; anything else must be a UUID. */
export function OptionalRelationId(label: string) {
  return applyDecorators(
    Transform(emptyToNull),
    IsOptional(),
    IsUUID(undefined, { message: `${label} must be a valid selection` }),
  );
}

/**
 * Optional relation id for a column that is NOT nullable, i.e. the value may be omitted
 * from a partial update but can never be cleared. "" is treated as omitted.
 */
export function OptionalNonNullRelationId(label: string) {
  return applyDecorators(
    Transform(({ value }) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    ),
    IsOptional(),
    IsUUID(undefined, { message: `${label} must be a valid selection` }),
  );
}

/** Required relation id. Rejects undefined/null/"" and non-UUID values with a readable message. */
export function RequiredRelationId(label: string) {
  return applyDecorators(
    Transform(emptyToNull),
    IsNotEmpty({ message: `${label} is required` }),
    IsUUID(undefined, { message: `${label} must be a valid selection` }),
  );
}
