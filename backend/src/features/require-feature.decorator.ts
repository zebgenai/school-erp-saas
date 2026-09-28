import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE_KEY = 'requireFeature';
export const FEATURE_SCHOOL_FROM_KEY = 'featureSchoolFrom';

/**
 * How FeatureGuard resolves schoolId for platform roles (SUPER_ADMIN)
 * when query/body schoolId is absent — from the target entity, not a tenant rewrite.
 */
export type FeatureSchoolFromSpec =
  | {
      source: 'param';
      name: string;
      entity: 'feeInvoice' | 'feePayment' | 'payroll' | 'exam' | 'class';
    }
  | {
      source: 'bodyIds';
      name: string;
      entity: 'feeInvoice';
    };

/** Marks a controller/handler as requiring an effectively enabled feature. */
export const RequireFeature = (featureKey: string) =>
  SetMetadata(REQUIRE_FEATURE_KEY, featureKey);

/**
 * Optional: resolve schoolId from the PDF/module entity for platform-role feature checks.
 * Does not change tenant isolation — only scopes FeatureGuard to the entity's school.
 */
export const FeatureSchoolFrom = (spec: FeatureSchoolFromSpec) =>
  SetMetadata(FEATURE_SCHOOL_FROM_KEY, spec);
