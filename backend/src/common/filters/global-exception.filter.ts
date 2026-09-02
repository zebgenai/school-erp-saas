import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { applyCorsHeaders } from '../utils/cors-origin';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const message =
      typeof body === 'string'
        ? body
        : (body as any)?.message || 'Unknown error';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status} — ${JSON.stringify(message)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(`${request.method} ${request.url} ${status} — ${JSON.stringify(message)}`);
    }

    applyCorsHeaders(
      request,
      response,
      request.app?.locals?.corsOrigins ?? [],
      Boolean(request.app?.locals?.corsIsProd),
    );

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
