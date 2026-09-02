import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const SKIP_FORCE_PASSWORD_KEY = 'skipForcePassword';

@Injectable()
export class ForcePasswordGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_FORCE_PASSWORD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const user = context.switchToHttp().getRequest().user;
    if (user?.forcePasswordChange) {
      throw new ForbiddenException(
        'Password change required. Please update your password before continuing.',
      );
    }
    return true;
  }
}
