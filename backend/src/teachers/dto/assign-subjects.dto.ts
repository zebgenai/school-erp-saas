import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignSubjectsDto {
  /**
   * Full desired set of subjects for this teacher. Subjects previously assigned to the
   * teacher but absent from this list are unassigned, so the request is idempotent.
   */
  @IsArray({ message: 'Subjects must be provided as a list' })
  @ArrayUnique({ message: 'The same subject cannot be assigned twice' })
  @IsUUID(undefined, { each: true, message: 'Each subject must be a valid selection' })
  subjectIds: string[];
}
