import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/types/current-user.type';
import { PrismaService } from '../prisma/prisma.service';
import {
  FEATURE_ALIASES,
  FEATURE_CATALOG,
  FEATURE_DISABLED_CODE,
  isKnownFeatureKey,
  resolveCanonicalFeatureKey,
} from './feature.constants';

export type EffectiveFeatureRow = {
  key: string;
  name: string;
  description: string | null;
  isCore: boolean;
  isGloballyEnabled: boolean;
  /** null = inherit */
  schoolOverride: boolean | null;
  isEnabled: boolean;
  overrideCount?: number;
};

/**
 * Resolve effective feature state.
 * Global OFF always wins. Missing SchoolFeature row = inherit (ON when global ON).
 */
export function resolveFeatureEnabled(
  isGloballyEnabled: boolean,
  schoolOverride: boolean | null | undefined,
): boolean {
  if (!isGloballyEnabled) return false;
  if (schoolOverride === null || schoolOverride === undefined) return true;
  return schoolOverride === true;
}

const RESULTS_MUTATION_MESSAGE =
  "Results is linked to Exams and has no independent runtime state. Change the 'exams' feature instead.";

@Injectable()
export class FeaturesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureCatalog();
  }

  /**
   * Idempotent upsert of the feature catalog (new keys default globally ON).
   * Does not overwrite existing isGloballyEnabled.
   */
  async ensureCatalog() {
    for (const entry of FEATURE_CATALOG) {
      await this.prisma.feature.upsert({
        where: { key: entry.key },
        create: {
          key: entry.key,
          name: entry.name,
          description: entry.description,
          isGloballyEnabled: true,
          isCore: entry.isCore,
        },
        update: {
          name: entry.name,
          description: entry.description,
          isCore: entry.isCore,
        },
      });
    }
  }

  /**
   * Whether a feature is effectively enabled for a school.
   * `results` always resolves as `exams` (alias).
   * When schoolId is null (platform context), only global flag applies.
   */
  async isFeatureEnabled(featureKey: string, schoolId?: string | null): Promise<boolean> {
    const canonical = resolveCanonicalFeatureKey(featureKey);
    const feature = await this.prisma.feature.findUnique({ where: { key: canonical } });
    if (!feature) {
      // Unknown feature: fail closed for controllable enforcement; unknown keys are not open.
      return false;
    }
    if (!feature.isGloballyEnabled) return false;
    if (!schoolId) return true;

    const override = await this.prisma.schoolFeature.findUnique({
      where: {
        schoolId_featureId: { schoolId, featureId: feature.id },
      },
    });
    return resolveFeatureEnabled(feature.isGloballyEnabled, override?.isEnabled ?? null);
  }

  /** Efficient map of all feature keys → effective enabled for a school (or global-only). */
  async getEffectiveFeatures(schoolId?: string | null): Promise<Record<string, boolean>> {
    const features = await this.prisma.feature.findMany({ orderBy: { key: 'asc' } });
    const overrides = schoolId
      ? await this.prisma.schoolFeature.findMany({ where: { schoolId } })
      : [];
    const byFeatureId = new Map<string, boolean>(
      overrides.map((o) => [o.featureId, o.isEnabled] as [string, boolean]),
    );
    const byKey = new Map(features.map((f) => [f.key, f]));

    const resolveOne = (key: string): boolean => {
      const canonical = resolveCanonicalFeatureKey(key);
      const f = byKey.get(canonical);
      if (!f) return false;
      const override: boolean | null = schoolId
        ? byFeatureId.has(f.id)
          ? (byFeatureId.get(f.id) as boolean)
          : null
        : null;
      return resolveFeatureEnabled(f.isGloballyEnabled, override);
    };

    const result: Record<string, boolean> = {};
    for (const f of features) {
      result[f.key] = resolveOne(f.key);
    }
    return result;
  }

  /** Keys that are effectively enabled (for /auth/me). */
  async getEnabledFeatureKeys(schoolId?: string | null): Promise<string[]> {
    const map = await this.getEffectiveFeatures(schoolId);
    return Object.keys(map).filter((k) => map[k]);
  }

  assertFeatureDisabledForbidden(featureKey: string): never {
    throw new ForbiddenException(
      `[${FEATURE_DISABLED_CODE}] Feature '${featureKey}' is disabled`,
    );
  }

  async listForAdmin() {
    const features = await this.prisma.feature.findMany({
      orderBy: [{ isCore: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { schoolFeatures: true } },
      },
    });
    const byKey = new Map(features.map((f) => [f.key, f]));

    return features.map((f) => {
      const linkedTo = FEATURE_ALIASES[f.key] ?? null;
      const canonical = linkedTo ? byKey.get(linkedTo) : f;
      return {
        key: f.key,
        name: f.name,
        description: f.description,
        isCore: f.isCore,
        isGloballyEnabled: canonical?.isGloballyEnabled ?? f.isGloballyEnabled,
        overrideCount: linkedTo
          ? (canonical?._count?.schoolFeatures ?? 0)
          : (f._count?.schoolFeatures ?? 0),
        linkedTo,
      };
    });
  }

  async getFeatureDetail(key: string) {
    const feature = await this.requireFeature(key);
    const linkedTo = FEATURE_ALIASES[key] ?? null;
    const canonical =
      linkedTo != null ? await this.requireFeature(linkedTo) : feature;

    const [schools, overrides] = await Promise.all([
      this.prisma.school.findMany({
        select: { id: true, name: true, slug: true, status: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.schoolFeature.findMany({ where: { featureId: canonical.id } }),
    ]);
    const overrideBySchool = new Map(overrides.map((o) => [o.schoolId, o.isEnabled]));

    return {
      key: feature.key,
      name: feature.name,
      description: feature.description,
      isCore: feature.isCore,
      isGloballyEnabled: canonical.isGloballyEnabled,
      linkedTo,
      schools: schools.map((s) => {
        const has = overrideBySchool.has(s.id);
        const override = has ? overrideBySchool.get(s.id)! : null;
        return {
          schoolId: s.id,
          name: s.name,
          slug: s.slug,
          status: s.status,
          override: has ? (override ? 'ON' : 'OFF') : 'INHERIT',
          isEnabled: resolveFeatureEnabled(canonical.isGloballyEnabled, override),
        };
      }),
    };
  }

  async getSchoolFeatures(schoolId: string) {
    await this.requireSchool(schoolId);
    const map = await this.getEffectiveFeatures(schoolId);
    const features = await this.prisma.feature.findMany({ orderBy: { name: 'asc' } });
    const overrides = await this.prisma.schoolFeature.findMany({ where: { schoolId } });
    const byFeatureId = new Map(overrides.map((o) => [o.featureId, o.isEnabled]));
    const byKey = new Map(features.map((f) => [f.key, f]));

    return {
      schoolId,
      features: features.map((f) => {
        const linkedTo = FEATURE_ALIASES[f.key] ?? null;
        const canonical = linkedTo ? byKey.get(linkedTo)! : f;
        return {
          key: f.key,
          name: f.name,
          description: f.description,
          isCore: f.isCore,
          isGloballyEnabled: canonical.isGloballyEnabled,
          schoolOverride: byFeatureId.has(canonical.id)
            ? byFeatureId.get(canonical.id)!
            : null,
          isEnabled: map[f.key] === true,
          linkedTo,
        };
      }),
    };
  }

  async setGlobal(key: string, isGloballyEnabled: boolean, currentUser: CurrentUser) {
    this.assertSuperAdmin(currentUser);
    this.assertNotAliasMutation(key);
    const feature = await this.requireFeature(key);
    if (feature.isCore && !isGloballyEnabled) {
      throw new BadRequestException(`Core feature '${key}' cannot be disabled globally`);
    }
    const updated = await this.prisma.feature.update({
      where: { id: feature.id },
      data: { isGloballyEnabled },
    });
    return {
      key: updated.key,
      isGloballyEnabled: updated.isGloballyEnabled,
      isCore: updated.isCore,
    };
  }

  async setSchoolOverride(
    key: string,
    schoolId: string,
    isEnabled: boolean,
    currentUser: CurrentUser,
  ) {
    this.assertSuperAdmin(currentUser);
    this.assertNotAliasMutation(key);
    const feature = await this.requireFeature(key);

if (feature.isCore && !isEnabled) {
  throw new BadRequestException(
    `Core feature '${key}' cannot be disabled for a school`,
  );
}

await this.requireSchool(schoolId);
    const row = await this.prisma.schoolFeature.upsert({
      where: {
        schoolId_featureId: { schoolId, featureId: feature.id },
      },
      create: { schoolId, featureId: feature.id, isEnabled },
      update: { isEnabled },
    });
    return {
      key: feature.key,
      schoolId,
      override: row.isEnabled ? 'ON' : 'OFF',
      isEnabled: resolveFeatureEnabled(feature.isGloballyEnabled, row.isEnabled),
    };
  }

  async resetSchoolOverride(key: string, schoolId: string, currentUser: CurrentUser) {
    this.assertSuperAdmin(currentUser);
    this.assertNotAliasMutation(key);
    const feature = await this.requireFeature(key);
    await this.requireSchool(schoolId);
    await this.prisma.schoolFeature.deleteMany({
      where: { schoolId, featureId: feature.id },
    });
    return {
      key: feature.key,
      schoolId,
      override: 'INHERIT',
      isEnabled: resolveFeatureEnabled(feature.isGloballyEnabled, null),
    };
  }

  private assertNotAliasMutation(key: string) {
    if (FEATURE_ALIASES[key]) {
      throw new BadRequestException(RESULTS_MUTATION_MESSAGE);
    }
  }

  private assertSuperAdmin(currentUser: CurrentUser) {
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can manage features');
    }
  }

  private async requireFeature(key: string) {
    if (!isKnownFeatureKey(key)) {
      throw new NotFoundException(`Feature '${key}' not found`);
    }
    const feature = await this.prisma.feature.findUnique({ where: { key } });
    if (!feature) throw new NotFoundException(`Feature '${key}' not found`);
    return feature;
  }

  private async requireSchool(schoolId: string) {
    if (!schoolId?.trim()) throw new BadRequestException('schoolId is required');
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new NotFoundException('School not found');
    return school;
  }
}
