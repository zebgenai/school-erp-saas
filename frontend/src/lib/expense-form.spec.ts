import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCreateExpenseCategoryPayload,
  buildCreateExpensePayload,
  buildExpenseCategoryPayload,
  buildExpensePayload,
  buildUpdateExpenseCategoryPayload,
  buildUpdateExpensePayload,
} from "./expense-form.ts";

describe("expense form", () => {
  it("create expense omits status and nested category", () => {
    const payload = buildCreateExpensePayload({
      title: "Electricity",
      categoryId: "cat-1",
      amount: "1500",
      date: "2026-09-01",
      description: "Sept bill",
      receiptUrl: "",
      status: "ACTIVE",
      category: { id: "cat-1", name: "Utilities" },
      id: "exp-1",
    });

    assert.deepEqual(payload, {
      title: "Electricity",
      categoryId: "cat-1",
      amount: 1500,
      date: "2026-09-01",
      description: "Sept bill",
    });
    assert.equal("status" in payload, false);
    assert.equal("category" in payload, false);
    assert.equal("id" in payload, false);
  });

  it("update expense may include status but never nested category", () => {
    const payload = buildUpdateExpensePayload({
      title: "Electricity",
      categoryId: "cat-1",
      amount: 1500,
      date: "2026-09-01",
      status: "CANCELLED",
      category: { id: "cat-1", name: "Utilities" },
      createdAt: "x",
      updatedAt: "y",
    });

    assert.equal(payload.status, "CANCELLED");
    assert.equal("category" in payload, false);
    assert.equal("createdAt" in payload, false);
  });

  it("buildExpensePayload switches create vs update correctly", () => {
    const create = buildExpensePayload(
      { title: "A", categoryId: "c", amount: 1, date: "2026-01-01", status: "ACTIVE" },
      false,
    );
    const update = buildExpensePayload(
      { title: "A", categoryId: "c", amount: 1, date: "2026-01-01", status: "ACTIVE" },
      true,
    );
    assert.equal("status" in create, false);
    assert.equal(update.status, "ACTIVE");
  });

  it("create category omits isActive", () => {
    const payload = buildCreateExpenseCategoryPayload({
      name: "Utilities",
      description: "Power & water",
      isActive: true,
      id: "cat-1",
    });
    assert.deepEqual(payload, { name: "Utilities", description: "Power & water" });
    assert.equal("isActive" in payload, false);
  });

  it("update category includes isActive when provided", () => {
    const payload = buildUpdateExpenseCategoryPayload({
      name: "Utilities",
      description: "",
      isActive: "false",
    });
    assert.deepEqual(payload, { name: "Utilities", isActive: false });
  });

  it("buildExpenseCategoryPayload switches create vs update", () => {
    const create = buildExpenseCategoryPayload({ name: "X", isActive: true }, false);
    const update = buildExpenseCategoryPayload({ name: "X", isActive: false }, true);
    assert.equal("isActive" in create, false);
    assert.equal(update.isActive, false);
  });
});
