import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNoticePayload,
  noticeFormFields,
  normalizeTargetRoles,
  parseIsPublished,
  syncNoticePublishState,
  toNoticeFormValues,
} from "./communication-notice-form.ts";

const FORBIDDEN_KEYS = ["body", "audience", "publishDate", "expiryDate", "status"];

describe("communication notice form", () => {
  it("uses backend targetRoles values instead of plural audience aliases", () => {
    assert.equal(normalizeTargetRoles("STUDENTS"), "STUDENT");
    assert.equal(normalizeTargetRoles("PARENTS"), "PARENT");
    assert.equal(normalizeTargetRoles("TEACHERS"), "TEACHER");
    assert.equal(normalizeTargetRoles("ALL"), "ALL");
    assert.equal(normalizeTargetRoles("STAFF"), "ALL");
  });

  it("maps an existing notice into form values without exposing IDs as the message", () => {
    const form = toNoticeFormValues({
      id: "n1",
      title: "Sports Day",
      type: "EVENT",
      content: "Bring water bottles.",
      targetRoles: "STUDENT",
      startDate: "2026-09-20T00:00:00.000Z",
      endDate: "2026-09-21T00:00:00.000Z",
      isPublished: true,
    });
    assert.equal(form.content, "Bring water bottles.");
    assert.equal(form.targetRoles, "STUDENT");
    assert.equal(form.startDate, "2026-09-20");
    assert.equal(form.endDate, "2026-09-21");
    assert.equal(form.isPublished, "true");
    assert.equal(form.body, undefined);
  });

  it("builds a CreateNoticeDto payload without legacy aliases", () => {
    const payload = buildNoticePayload({
      title: "Fee reminder",
      type: "ANNOUNCEMENT",
      content: "Please pay by Friday.",
      targetRoles: "PARENTS",
      startDate: "2026-09-17",
      endDate: "2026-09-30",
      isPublished: "true",
      body: "legacy",
      audience: "PARENTS",
      publishDate: "2026-01-01",
      expiryDate: "2026-01-02",
      status: "ACTIVE",
    });

    assert.equal(payload.title, "Fee reminder");
    assert.equal(payload.type, "ANNOUNCEMENT");
    assert.equal(payload.content, "Please pay by Friday.");
    assert.equal(payload.targetRoles, "PARENT");
    assert.equal(payload.startDate, "2026-09-17");
    assert.equal(payload.endDate, "2026-09-30");
    assert.equal("isPublished" in payload, false);

    for (const key of FORBIDDEN_KEYS) {
      assert.equal(key in payload, false, `payload must not contain ${key}`);
    }
  });

  it("omits empty dates so class-validator does not receive blank strings", () => {
    const payload = buildNoticePayload({
      title: "Draft",
      type: "NOTICE",
      content: "Hello",
      targetRoles: "ALL",
      startDate: "",
      endDate: "",
    });
    assert.equal("startDate" in payload, false);
    assert.equal("endDate" in payload, false);
  });

  it("declares DTO field keys on the form", () => {
    const keys = noticeFormFields().map((field) => field.key);
    assert.deepEqual(
      keys.filter((key) => ["content", "targetRoles", "startDate", "endDate", "isPublished"].includes(key)).sort(),
      ["content", "endDate", "isPublished", "startDate", "targetRoles"].sort(),
    );
    for (const key of FORBIDDEN_KEYS) {
      assert.equal(keys.includes(key), false);
    }
  });

  it("publishes via the dedicated endpoint when a draft becomes published", async () => {
    const calls: string[] = [];
    const action = await syncNoticePublishState({
      noticeId: "n1",
      wasPublished: false,
      wantPublished: parseIsPublished("true"),
      publish: async (id) => { calls.push(`publish:${id}`); },
      unpublish: async (id) => { calls.push(`unpublish:${id}`); },
    });
    assert.equal(action, "publish");
    assert.deepEqual(calls, ["publish:n1"]);
  });

  it("unpublishes via the dedicated endpoint when a published notice becomes a draft", async () => {
    const calls: string[] = [];
    const action = await syncNoticePublishState({
      noticeId: "n2",
      wasPublished: true,
      wantPublished: parseIsPublished("false"),
      publish: async (id) => { calls.push(`publish:${id}`); },
      unpublish: async (id) => { calls.push(`unpublish:${id}`); },
    });
    assert.equal(action, "unpublish");
    assert.deepEqual(calls, ["unpublish:n2"]);
  });

  it("does not call publish/unpublish when the published flag is unchanged", async () => {
    const calls: string[] = [];
    const action = await syncNoticePublishState({
      noticeId: "n3",
      wasPublished: true,
      wantPublished: true,
      publish: async (id) => { calls.push(`publish:${id}`); },
      unpublish: async (id) => { calls.push(`unpublish:${id}`); },
    });
    assert.equal(action, "none");
    assert.deepEqual(calls, []);
  });
});
