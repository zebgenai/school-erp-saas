/**
 * Frontend Feature Control helpers (additive to permissions).
 * Backend FeatureGuard remains the security boundary for API enforcement.
 */

/** Controllable feature keys that map to school app routes / nav. */
export const CONTROLLABLE_ROUTE_FEATURES = [
  "exams",
  "results",
  "fees",
  "payroll",
  "expenses",
  "library",
  "transport",
  "communication",
  "notifications",
  "homework",
  "online-classes",
  "academic-calendar",
  "timetable",
  "reports",
] as const;

export type ControllableFeatureKey = (typeof CONTROLLABLE_ROUTE_FEATURES)[number];

/**
 * Catalog aliases: effective state mirrors the canonical feature.
 * Must stay aligned with backend FEATURE_ALIASES.
 */
export const FEATURE_ALIASES: Record<string, string> = {
  results: "exams",
};

export function resolveCanonicalFeatureKey(featureKey: string): string {
  return FEATURE_ALIASES[featureKey] ?? featureKey;
}

/** First path segment → feature key (only controllable modules). */
export const ROUTE_FEATURE_KEYS: Record<string, ControllableFeatureKey> = {
  "/exams": "exams",
  "/fees": "fees",
  "/payroll": "payroll",
  "/expenses": "expenses",
  "/library": "library",
  "/transport": "transport",
  "/communication": "communication",
  "/academic-calendar": "academic-calendar",
  "/timetable": "timetable",
  "/reports": "reports",
};

export function isFeatureEnabled(
  featureKey: string,
  enabledFeatures?: string[] | null,
): boolean {
  // Until /auth/me provides the list, do not block (backward compatible).
  if (!enabledFeatures) return true;
  const canonical = resolveCanonicalFeatureKey(featureKey);
  return enabledFeatures.includes(canonical) || enabledFeatures.includes(featureKey);
}

export function featureKeyForPath(path: string): ControllableFeatureKey | null {
  const base = "/" + (path || "/").split("/").filter(Boolean)[0];
  return ROUTE_FEATURE_KEYS[base] ?? null;
}

/**
 * Route is blocked when its controllable feature is effectively OFF.
 * Core routes (students, attendance, …) have no mapping → never blocked by features.
 */
export function isPathFeatureAllowed(
  path: string,
  enabledFeatures?: string[] | null,
): boolean {
  const key = featureKeyForPath(path);
  if (!key) return true;
  return isFeatureEnabled(key, enabledFeatures);
}

/** True when the Super Admin UI must treat this key as a read-only mirror. */
export function isLinkedFeatureKey(featureKey: string): boolean {
  return featureKey in FEATURE_ALIASES;
}
