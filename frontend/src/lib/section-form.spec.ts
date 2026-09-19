import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCreateSectionPayload,
  buildSectionPayload,
  buildUpdateSectionPayload,
} from "./section-form.ts";

describe("section form", () => {
  it("create includes classId", () => {
    const payload = buildCreateSectionPayload({
      name: "A",
      classId: "class-1",
      teacherId: "t-1",
    });
    assert.deepEqual(payload, {
      name: "A",
      classId: "class-1",
      teacherId: "t-1",
    });
  });

  it("update omits classId", () => {
    const payload = buildUpdateSectionPayload({
      name: "B",
      classId: "class-1",
      teacherId: "",
    });
    assert.deepEqual(payload, { name: "B", teacherId: null });
    assert.equal("classId" in payload, false);
  });

  it("buildSectionPayload switches create vs update", () => {
    const create = buildSectionPayload({ name: "A", classId: "c1", teacherId: null }, false);
    const update = buildSectionPayload({ name: "A", classId: "c1", teacherId: null }, true);
    assert.equal(create.classId, "c1");
    assert.equal("classId" in update, false);
  });
});
