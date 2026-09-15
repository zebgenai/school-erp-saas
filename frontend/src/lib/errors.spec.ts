import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, formatLoginError, formatApiError, parseLoginError } from "./errors.ts";

describe("login error handling", () => {
  it("shows a friendly message for invalid credentials (401)", () => {
    const error = new ApiError("Invalid email or password", 401, {
      message: "Invalid email or password",
    });
    assert.equal(formatLoginError(error), "Invalid email or password.");
    assert.equal(parseLoginError(error).kind, "credentials");
  });

  it("shows a lockout alert for a locked account (403)", () => {
    const error = new ApiError("Too many failed login attempts. Account locked for 15 minutes.", 403, {
      message: "Too many failed login attempts. Account locked for 15 minutes.",
    });
    const view = parseLoginError(error);
    assert.equal(view.kind, "locked");
    assert.match(view.title || "", /Account temporarily locked/);
    assert.match(view.message, /try again in 15 minutes/i);
    assert.doesNotMatch(formatLoginError(error), /do not have permission/i);
  });

  it("uses remaining minutes from the backend lockout message", () => {
    const error = new ApiError(
      "Account locked due to too many failed attempts. Try again in 14 minute(s).",
      403,
      { message: "Account locked due to too many failed attempts. Try again in 14 minute(s)." },
    );
    const view = parseLoginError(error);
    assert.equal(view.kind, "locked");
    assert.match(view.message, /try again in 14 minutes/i);
    assert.doesNotMatch(view.message, /15 minutes/);
  });

  it("preserves a meaningful generic 403 instead of a permission fallback", () => {
    const error = new ApiError("School is currently offline for maintenance.", 403, {
      message: "School is currently offline for maintenance.",
    });
    assert.equal(formatLoginError(error), "School is currently offline for maintenance.");
    assert.doesNotMatch(formatLoginError(error), /do not have permission/i);
  });

  it("falls back for an empty generic 403", () => {
    const error = new ApiError("Forbidden", 403, { message: "Forbidden" });
    assert.equal(formatLoginError(error), "You do not have permission to perform this action.");
  });

  it("shows a safe message for unexpected server errors", () => {
    const error = new ApiError("prisma: Unique constraint failed on the fields: (`email`)", 500, {
      message: "prisma: Unique constraint failed on the fields: (`email`)",
    });
    assert.equal(formatLoginError(error), "Something went wrong on our end. Please try again shortly.");
    assert.doesNotMatch(formatLoginError(error), /prisma/i);
  });

  it("does not treat a post-login 401 as invalid credentials", () => {
    const error = new ApiError("Unauthorized", 401);
    assert.equal(formatApiError(error), "Your session has expired. Please sign in again.");
  });

  it("shows an inactive-account message for a 403 inactive response", () => {
    const error = new ApiError("User account is inactive", 403, {
      message: "User account is inactive",
    });
    const view = parseLoginError(error);
    assert.equal(view.kind, "inactive");
    assert.match(view.title || view.message, /inactive/i);
  });
});
