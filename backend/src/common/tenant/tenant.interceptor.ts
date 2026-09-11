import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { assertRequestTenantIsolation } from './tenant-isolation';

@Injectable()
export class TenantIsolationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (req?.method === 'OPTIONS') {
      return next.handle();
    }
    assertRequestTenantIsolation(req);
    return next.handle();
  }
}
