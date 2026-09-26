import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTeacherSettingsQuery,
  buildTeacherSettingsResetBody,
  buildTeacherSettingsSaveBody,
  mapSuperAdminSchoolsList,
  resolveTeacherSettingsTargetSchoolId,
  shouldApplyTeacherSettingsResponse,
  shouldShowTeacherSettingsSchoolPicker,
} from "./teacher-id-card-settings-ui.ts";

describe("Teacher ID card settings UI — Super Admin school targeting", () => {
  it("shows school picker only for SUPER_ADMIN", () => {
    assert.equal(shouldShowTeacherSettingsSchoolPicker("SUPER_ADMIN"), true);
    assert.equal(shouldShowTeacherSettingsSchoolPicker("SCHOOL_ADMIN"), false);
    assert.equal(shouldShowTeacherSettingsSchoolPicker("RECEPTIONIST"), false);
  });

  it("SCHOOL_ADMIN always uses own school and ignores selectedSchoolId", () => {
    assert.equal(
      resolveTeacherSettingsTargetSchoolId({
        role: "SCHOOL_ADMIN",
        ownSchoolId: "school-a",
        selectedSchoolId: "school-b",
      }),
      "school-a",
    );
    assert.equal(
      resolveTeacherSettingsTargetSchoolId({
        role: "SCHOOL_ADMIN",
        ownSchoolId: "school-a",
        selectedSchoolId: null,
      }),
      "school-a",
    );
  });

  it("SUPER_ADMIN uses only the explicitly selected school", () => {
    assert.equal(
      resolveTeacherSettingsTargetSchoolId({
        role: "SUPER_ADMIN",
        ownSchoolId: null,
        selectedSchoolId: "school-b",
      }),
      "school-b",
    );
    assert.equal(
      resolveTeacherSettingsTargetSchoolId({
        role: "SUPER_ADMIN",
        ownSchoolId: null,
        selectedSchoolId: null,
      }),
      null,
    );
    // Never fall back to a previous/own school id
    assert.equal(
      resolveTeacherSettingsTargetSchoolId({
        role: "SUPER_ADMIN",
        ownSchoolId: "stale-school",
        selectedSchoolId: "",
      }),
      null,
    );
  });

  it("GET query includes schoolId only for SUPER_ADMIN", () => {
    assert.deepEqual(buildTeacherSettingsQuery("SUPER_ADMIN", "school-b"), { schoolId: "school-b" });
    assert.equal(buildTeacherSettingsQuery("SCHOOL_ADMIN", "school-a"), undefined);
    assert.equal(buildTeacherSettingsQuery("SUPER_ADMIN", null), undefined);
  });

  it("save body includes schoolId for SUPER_ADMIN and omits it for SCHOOL_ADMIN", () => {
    const colors = {
      primary: "#115e59",
      accent: "#2dd4bf",
      background: "#ffffff",
      text: "#134e4a",
    };
    assert.deepEqual(buildTeacherSettingsSaveBody(colors, "SUPER_ADMIN", "school-b"), {
      ...{
        primaryColor: colors.primary,
        accentColor: colors.accent,
        backgroundColor: colors.background,
        textColor: colors.text,
      },
      schoolId: "school-b",
    });
    assert.deepEqual(buildTeacherSettingsSaveBody(colors, "SCHOOL_ADMIN", "school-a"), {
      primaryColor: colors.primary,
      accentColor: colors.accent,
      backgroundColor: colors.background,
      textColor: colors.text,
    });
  });

  it("reset body includes schoolId for SUPER_ADMIN only", () => {
    assert.deepEqual(buildTeacherSettingsResetBody("SUPER_ADMIN", "school-b"), { schoolId: "school-b" });
    assert.deepEqual(buildTeacherSettingsResetBody("SCHOOL_ADMIN", "school-a"), {});
  });

  it("switching schools requires matching response schoolId before applying colors", () => {
    assert.equal(shouldApplyTeacherSettingsResponse("school-a", "school-a"), true);
    assert.equal(shouldApplyTeacherSettingsResponse("school-a", "school-b"), false);
    assert.equal(shouldApplyTeacherSettingsResponse(null, "school-b"), false);
  });

  it("maps /super-admin/schools list payload", () => {
    const mapped = mapSuperAdminSchoolsList({
      data: [
        { id: "s1", name: "Alpha", status: "ACTIVE" },
        { id: "s2", name: "Beta" },
        { id: 3, name: "bad" },
      ],
    });
    assert.deepEqual(mapped, [
      { id: "s1", name: "Alpha", status: "ACTIVE" },
      { id: "s2", name: "Beta", status: null },
    ]);
  });
});
