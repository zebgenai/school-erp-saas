import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantResolverService } from './tenant.service';
import './tenant.types';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenants: TenantResolverService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    try {
      const school = await this.tenants.resolveFromHost(req.headers.host);
      req.tenantSchool = school;
      req.tenantSchoolId = school?.id ?? null;
      next();
    } catch (err) {
      next(err);
    }
  }
}
