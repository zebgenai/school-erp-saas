import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHANGE_PASSWORD_ENDPOINT,
  FORCE_CHANGE_PASSWORD_PATH,
  PASSWORD_POLICY_MESSAGE,
  buildChangePasswordRequest,
  isStrongPassword,
  postAuthPath,
  shouldLeaveForcePasswordPage,
  shouldRedirectForcedUser,
  validatePasswordChange,
} from "./force-password.ts";

const home = (role?: string) => (role === "TEACHER" ? "/teacher" : "/dashboard");

describe("force password helpers", () => {
  it("redirects forced users to the force-change page after login", () => {
    assert.equal(
      postAuthPath({ role: "TEACHER", forcePasswordChange: true }, home),
      FORCE_CHANGE_PASSWORD_PATH,
    );
  });

  it("sends normal users to their role home", () => {
    assert.equal(
      postAuthPath({ role: "TEACHER", forcePasswordChange: false }, home),
      "/teacher",
    );
    assert.equal(postAuthPath({ role: "SCHOOL_ADMIN" }, home), "/dashboard");
  });

  it("blocks forced users from remaining on /dashboard and other app routes", () => {
    const forced = { role: "SCHOOL_ADMIN", forcePasswordChange: true };
    assert.equal(shouldRedirectForcedUser(forced, "/dashboard"), FORCE_CHANGE_PASSWORD_PATH);
    assert.equal(shouldRedirectForcedUser(forced, "/students"), FORCE_CHANGE_PASSWORD_PATH);
    assert.equal(shouldRedirectForcedUser(forced, "/teachers"), FORCE_CHANGE_PASSWORD_PATH);
    assert.equal(shouldRedirectForcedUser(forced, "/settings"), FORCE_CHANGE_PASSWORD_PATH);
    assert.equal(shouldRedirectForcedUser(forced, FORCE_CHANGE_PASSWORD_PATH), null);
  });

  it("does not redirect normal users away from app routes", () => {
    assert.equal(
      shouldRedirectForcedUser({ role: "TEACHER", forcePasswordChange: false }, "/dashboard"),
      null,
    );
  });

  it("keeps forced users on the force page across refresh (no loop)", () => {
    const forced = { role: "TEACHER", forcePasswordChange: true };
    assert.equal(shouldRedirectForcedUser(forced, FORCE_CHANGE_PASSWORD_PATH), null);
    assert.equal(
      shouldLeaveForcePasswordPage(forced, FORCE_CHANGE_PASSWORD_PATH, home),
      null,
    );
  });

  it("sends users home after the flag clears", () => {
    assert.equal(
      shouldLeaveForcePasswordPage(
        { role: "TEACHER", forcePasswordChange: false },
        FORCE_CHANGE_PASSWORD_PATH,
        home,
      ),
      "/teacher",
    );
    assert.equal(
      postAuthPath({ role: "TEACHER", forcePasswordChange: false }, home),
      "/teacher",
    );
  });

  it("builds the change-password request for the forced page", () => {
    assert.equal(CHANGE_PASSWORD_ENDPOINT, "/auth/change-password");
    assert.deepEqual(
      buildChangePasswordRequest({
        currentPassword: "TempPass1",
        newPassword: "StrongPass1",
      }),
      { currentPassword: "TempPass1", newPassword: "StrongPass1" },
    );
  });

  it("leaves login/OTP destinations unchanged for non-forced users", () => {
    assert.equal(postAuthPath({ role: "PARENT", forcePasswordChange: false }, home), "/dashboard");
    assert.equal(
      postAuthPath({ role: "PARENT", forcePasswordChange: true }, home),
      FORCE_CHANGE_PASSWORD_PATH,
    );
  });

  it("validates strong passwords for the change form", () => {
    assert.equal(isStrongPassword("Short1"), false);
    assert.equal(isStrongPassword("weakpassword1"), false);
    assert.equal(isStrongPassword("StrongPass1"), true);

    assert.equal(
      validatePasswordChange({
        currentPassword: "TempPass1",
        newPassword: "weak",
        confirmPassword: "weak",
      }),
      PASSWORD_POLICY_MESSAGE,
    );

    assert.equal(
      validatePasswordChange({
        currentPassword: "TempPass1",
        newPassword: "StrongPass1",
        confirmPassword: "StrongPass2",
      }),
      "Passwords do not match",
    );

    assert.equal(
      validatePasswordChange({
        currentPassword: "StrongPass1",
        newPassword: "StrongPass1",
        confirmPassword: "StrongPass1",
      }),
      "New password must be different from the current password",
    );

    assert.equal(
      validatePasswordChange({
        currentPassword: "TempPass1",
        newPassword: "StrongPass1",
        confirmPassword: "StrongPass1",
      }),
      null,
    );
  });
});
