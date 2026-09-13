import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { schoolPlanDisplay } from "./school-plan-display.ts";

describe("school plan display", () => {
  it("shows plan name and status when a subscription exists", () => {
    const view = schoolPlanDisplay({
      status: "ACTIVE",
      endDate: "2026-12-31T00:00:00.000Z",
      plan: { name: "Professional" },
    });
    assert.equal(view.planName, "Professional");
    assert.equal(view.status, "ACTIVE");
    assert.equal(view.hasPlan, true);
    assert.ok(view.endDate);
  });

  it("shows No Plan when the school has no subscription", () => {
    const view = schoolPlanDisplay(null);
    assert.equal(view.planName, "No Plan");
    assert.equal(view.status, null);
    assert.equal(view.hasPlan, false);
    assert.equal(view.endDate, null);
  });
});
