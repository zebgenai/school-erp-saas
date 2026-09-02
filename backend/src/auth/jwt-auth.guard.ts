import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_FORCE_PASSWORD_KEY } from '../common/guards/force-password.guard';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.method === 'OPTIONS') return true;
    if (!req.headers.authorization && req.query?.access_token) {
      req.headers.authorization = `Bearer ${req.query.access_token}`;
    }

    const result = super.canActivate(context);
    if (result instanceof Observable) {
      return result.pipe(map((ok) => this.checkForcePassword(context, ok)));
    }
    return Promise.resolve(result).then((ok) => this.checkForcePassword(context, ok));
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }

  private checkForcePassword(context: ExecutionContext, ok: boolean) {
    if (!ok) return false;

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
