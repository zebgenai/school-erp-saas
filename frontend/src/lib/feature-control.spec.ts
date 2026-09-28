import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FEATURE_ALIASES,
  featureKeyForPath,
  isFeatureEnabled,
  isLinkedFeatureKey,
  isPathFeatureAllowed,
  resolveCanonicalFeatureKey,
} from "./feature-control.ts";
import { canRoutePath } from "./permissions-routing.ts";

describe("Feature Control frontend helpers", () => {
  it("feature ON -> path allowed", () => {
    assert.equal(isFeatureEnabled("communication", ["communication", "fees"]), true);
    assert.equal(isPathFeatureAllowed("/communication", ["communication"]), true);
  });

  it("feature OFF -> path blocked", () => {
    assert.equal(isFeatureEnabled("communication", ["fees"]), false);
    assert.equal(isPathFeatureAllowed("/communication", ["fees"]), false);
  });

  it("core attendance path has no controllable feature key", () => {
    assert.equal(featureKeyForPath("/attendance"), null);
    assert.equal(isPathFeatureAllowed("/attendance", []), true);
  });

  it("missing enabledFeatures list fails open (compat)", () => {
    assert.equal(isPathFeatureAllowed("/communication", null), true);
    assert.equal(isPathFeatureAllowed("/communication", undefined), true);
  });

  it("canRoutePath blocks Communication when feature disabled even for SCHOOL_ADMIN", () => {
    assert.equal(
      canRoutePath({
        role: "SCHOOL_ADMIN",
        path: "/communication",
        enabledFeatures: ["fees", "library"],
      }),
      false,
    );
    assert.equal(
      canRoutePath({
        role: "SCHOOL_ADMIN",
        path: "/communication",
        enabledFeatures: ["communication", "fees"],
      }),
      true,
    );
  });

  it("SUPER_ADMIN school nav path respects feature state when schoolId present", () => {
    assert.equal(
      canRoutePath({
        role: "SUPER_ADMIN",
        path: "/communication",
        schoolId: "school-1",
        enabledFeatures: [],
      }),
      false,
    );
  });

  it("ATTENDANCE_SCANNER portal unchanged by feature list", () => {
    assert.equal(
      canRoutePath({
        role: "ATTENDANCE_SCANNER",
        path: "/attendance",
        enabledFeatures: [],
      }),
      true,
    );
    assert.equal(
      canRoutePath({
        role: "ATTENDANCE_SCANNER",
        path: "/communication",
        enabledFeatures: ["communication"],
      }),
      false,
    );
  });

  it("permission still required when feature ON for non-admin roles", () => {
    assert.equal(
      canRoutePath({
        role: "TEACHER",
        path: "/communication",
        permissions: {},
        enabledFeatures: ["communication"],
      }),
      false,
    );
    assert.equal(
      canRoutePath({
        role: "TEACHER",
        path: "/communication",
        permissions: { "communication.view": true },
        enabledFeatures: ["communication"],
      }),
      true,
    );
  });

  it("results follows exams alias", () => {
    assert.equal(FEATURE_ALIASES.results, "exams");
    assert.equal(resolveCanonicalFeatureKey("results"), "exams");
    assert.equal(isLinkedFeatureKey("results"), true);
    assert.equal(isLinkedFeatureKey("exams"), false);
    assert.equal(isFeatureEnabled("results", ["exams", "fees"]), true);
    assert.equal(isFeatureEnabled("results", ["fees"]), false);
  });

  it("results cannot appear as independently configurable route", () => {
    assert.equal(featureKeyForPath("/exams"), "exams");
    // No /results route mapping — Results is not a separate nav feature key.
    assert.equal(featureKeyForPath("/results"), null);
  });

  it("Reports route behavior unchanged", () => {
    assert.equal(featureKeyForPath("/reports"), "reports");
    assert.equal(isPathFeatureAllowed("/reports", ["reports"]), true);
    assert.equal(isPathFeatureAllowed("/reports", ["fees"]), false);
  });

  it("core routes unchanged", () => {
    for (const path of ["/students", "/attendance", "/dashboard", "/id-cards"]) {
      assert.equal(featureKeyForPath(path), null);
      assert.equal(isPathFeatureAllowed(path, []), true);
    }
  });
});
