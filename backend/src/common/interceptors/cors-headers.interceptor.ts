import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { applyCorsHeaders } from '../utils/cors-origin';

/**
 * Re-applies CORS on the Nest response object before the handler runs so PDF
 * `res.end(buffer)` responses keep Access-Control-Allow-Origin.
 */
@Injectable()
export class CorsHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const allowed: string[] = req.app?.locals?.corsOrigins ?? [];
    const isProd = Boolean(req.app?.locals?.corsIsProd);
    applyCorsHeaders(req, res, allowed, isProd);
    return next.handle();
  }
}
