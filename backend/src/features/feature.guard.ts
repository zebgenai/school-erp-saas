import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { isPlatformRole } from '../roles/roles.constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  FEATURE_SCHOOL_FROM_KEY,
  FeatureSchoolFromSpec,
  REQUIRE_FEATURE_KEY,
} from './require-feature.decorator';
import { FeaturesService } from './features.service';

/**
 * Runs alongside JwtAuthGuard + RolesGuard (does not replace them).
 * Resolves schoolId from JWT for school users, or query/body schoolId for platform roles.
 * When a platform role has no schoolId, optional @FeatureSchoolFrom metadata resolves
 * school(s) from the target entity so school OFF overrides cannot be bypassed.
 * Platform roles without a schoolId and without entity metadata only require global ON.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featuresService: FeaturesService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!featureKey) return true;

    const request = context.switchToHttp().getRequest();
    if (request.method === 'OPTIONS') return true;

    const user = request.user as
      | { role?: UserRole; schoolId?: string | null }
      | undefined;

    const schoolIds = await this.resolveSchoolIds(user, request, context);
    for (const schoolId of schoolIds) {
      const enabled = await this.featuresService.isFeatureEnabled(featureKey, schoolId);
      if (!enabled) {
        this.featuresService.assertFeatureDisabledForbidden(featureKey);
      }
    }
    return true;
  }

  private async resolveSchoolIds(
    user: { role?: UserRole; schoolId?: string | null } | undefined,
    request: { body?: unknown; query?: unknown; params?: Record<string, string> },
    context: ExecutionContext,
  ): Promise<Array<string | null>> {
    if (!user) return [null];

    if (!(user.role && isPlatformRole(user.role))) {
      return [user.schoolId ?? null];
    }

    const raw =
      (request.body as { schoolId?: unknown } | undefined)?.schoolId ??
      (request.query as { schoolId?: unknown } | undefined)?.schoolId;
    if (typeof raw === 'string' && raw.trim()) {
      return [raw.trim()];
    }

    const schoolFrom = this.reflector.getAllAndOverride<FeatureSchoolFromSpec | undefined>(
      FEATURE_SCHOOL_FROM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!schoolFrom) return [null];

    const fromEntity = await this.resolveSchoolFromEntity(schoolFrom, request);
    return fromEntity.length > 0 ? fromEntity : [null];
  }

  private async resolveSchoolFromEntity(
    spec: FeatureSchoolFromSpec,
    request: { body?: unknown; params?: Record<string, string> },
  ): Promise<string[]> {
    if (spec.source === 'param') {
      const id = request.params?.[spec.name];
      if (!id?.trim()) return [];
      const schoolId = await this.lookupSchoolId(spec.entity, id.trim());
      return schoolId ? [schoolId] : [];
    }

    const raw = (request.body as Record<string, unknown> | undefined)?.[spec.name];
    const ids = Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
    if (ids.length === 0) return [];

    if (spec.entity === 'feeInvoice') {
      const rows = await this.prisma.feeInvoice.findMany({
        where: { id: { in: ids } },
        select: { schoolId: true },
      });
      return [...new Set(rows.map((r) => r.schoolId))];
    }
    return [];
  }

  private async lookupSchoolId(
    entity: 'feeInvoice' | 'feePayment' | 'payroll' | 'exam' | 'class',
    id: string,
  ): Promise<string | null> {
    switch (entity) {
      case 'feeInvoice': {
        const row = await this.prisma.feeInvoice.findUnique({
          where: { id },
          select: { schoolId: true },
        });
        return row?.schoolId ?? null;
      }
      case 'feePayment': {
        const row = await this.prisma.feePayment.findUnique({
          where: { id },
          select: { schoolId: true },
        });
        return row?.schoolId ?? null;
      }
      case 'payroll': {
        const row = await this.prisma.payroll.findUnique({
          where: { id },
          select: { schoolId: true },
        });
        return row?.schoolId ?? null;
      }
      case 'exam': {
        const row = await this.prisma.exam.findUnique({
          where: { id },
          select: { schoolId: true },
        });
        return row?.schoolId ?? null;
      }
      case 'class': {
        const row = await this.prisma.class.findUnique({
          where: { id },
          select: { schoolId: true },
        });
        return row?.schoolId ?? null;
      }
      default:
        return null;
    }
  }
}
