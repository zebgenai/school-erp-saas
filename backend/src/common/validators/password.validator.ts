import { BadRequestException } from '@nestjs/common';
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Min 8 chars, uppercase, lowercase, and digit */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/;

export const PASSWORD_POLICY_MESSAGE =
  'Password must be 8–128 characters and include uppercase, lowercase, and a number';

@ValidatorConstraint({ name: 'isStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && PASSWORD_REGEX.test(value);
  }

  defaultMessage() {
    return PASSWORD_POLICY_MESSAGE;
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}

export function assertStrongPassword(password: string) {
  if (!PASSWORD_REGEX.test(password)) {
    throw new BadRequestException(PASSWORD_POLICY_MESSAGE);
  }
}
