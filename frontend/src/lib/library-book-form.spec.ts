import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookFormFields,
  buildCreateBookPayload,
  categorySelectOptions,
} from "./library-book-form.ts";

const FORBIDDEN_KEYS = ["category", "quantity", "available", "shelf"];

describe("library book form", () => {
  it("uses category.id as the select value and category.name as the label", () => {
    const options = categorySelectOptions([
      { id: "cat-science-1", name: "Science" },
      { id: "cat-fiction-2", name: "Fiction" },
    ]);

    assert.deepEqual(options, [
      { value: "cat-science-1", label: "Science" },
      { value: "cat-fiction-2", label: "Fiction" },
    ]);
    for (const option of options) {
      assert.notEqual(option.value, option.label);
    }
  });

  it("declares CreateBookDto field keys and omits legacy aliases", () => {
    const keys = bookFormFields([]).map((field) => field.key);

    assert.ok(keys.includes("categoryId"));
    assert.ok(keys.includes("totalCopies"));
    assert.ok(keys.includes("shelfLocation"));
    for (const key of FORBIDDEN_KEYS) {
      assert.equal(keys.includes(key), false, `form must not declare ${key}`);
    }
    assert.equal(keys.includes("availableCopies"), false);
    assert.equal(keys.includes("schoolId"), false);
  });

  it("posts categoryId, totalCopies, and shelfLocation without legacy aliases", () => {
    const fields = bookFormFields([
      { value: "cat-science-1", label: "Science" },
    ]);
    const payload = buildCreateBookPayload(
      {
        title: "Physics 101",
        author: "Ada Lovelace",
        categoryId: "cat-science-1",
        isbn: "978-000",
        publisher: "Campus Press",
        totalCopies: "3",
        shelfLocation: "A-12",
        category: "Science",
        quantity: 10,
        available: 8,
        shelf: "Old Shelf",
      },
      fields,
    );

    assert.equal(payload.title, "Physics 101");
    assert.equal(payload.author, "Ada Lovelace");
    assert.equal(payload.categoryId, "cat-science-1");
    assert.equal(payload.isbn, "978-000");
    assert.equal(payload.publisher, "Campus Press");
    assert.equal(payload.totalCopies, 3);
    assert.equal(payload.shelfLocation, "A-12");

    for (const key of FORBIDDEN_KEYS) {
      assert.equal(key in payload, false, `payload must not contain ${key}`);
    }
    assert.equal("availableCopies" in payload, false);
    assert.equal("schoolId" in payload, false);
  });
});
