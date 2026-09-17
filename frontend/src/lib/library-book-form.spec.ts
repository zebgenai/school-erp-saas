import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookFormFields,
  buildCreateBookPayload,
  categoryNameSuggestions,
  findCategoryByName,
  prepareBookSavePayload,
  resolveCategoryId,
  toBookFormValues,
} from "./library-book-form.ts";

const FORBIDDEN_KEYS = ["category", "quantity", "available", "shelf", "categoryName"];

const existing = [
  { id: "cat-english-1", name: "English" },
  { id: "cat-science-2", name: "Science" },
];

function failCreate(): Promise<{ id: string; name: string }> {
  throw new Error("should not create a category");
}

describe("library book form", () => {
  it("uses category names as typeahead suggestions, not category ids", () => {
    const suggestions = categoryNameSuggestions(existing);
    assert.deepEqual(suggestions, ["English", "Science"]);
    assert.equal(suggestions.includes("cat-english-1"), false);
  });

  it("resolves an existing category name to its existing id", async () => {
    const id = await resolveCategoryId("English", existing, { createCategory: failCreate });
    assert.equal(id, "cat-english-1");
  });

  it("treats whitespace and case variants as the same category", async () => {
    assert.equal(findCategoryByName(existing, " english ")?.id, "cat-english-1");
    assert.equal(findCategoryByName(existing, "ENGLISH")?.id, "cat-english-1");

    const id = await resolveCategoryId("  english ", existing, { createCategory: failCreate });
    assert.equal(id, "cat-english-1");
  });

  it("creates a new category only once", async () => {
    const remote: Array<{ id: string; name: string }> = [];
    let creates = 0;
    const deps = {
      listCategories: async () => remote,
      createCategory: async (name: string) => {
        creates += 1;
        const created = { id: `cat-new-${creates}`, name };
        remote.push(created);
        return created;
      },
    };

    const first = await resolveCategoryId("Islamic Studies", [], deps);
    const second = await resolveCategoryId(" islamic studies ", [], deps);

    assert.equal(creates, 1);
    assert.equal(first, "cat-new-1");
    assert.equal(second, first);
  });

  it("posts categoryId, totalCopies, and shelfLocation without legacy aliases", async () => {
    const payload = await prepareBookSavePayload(
      {
        title: "Physics 101",
        author: "Ada Lovelace",
        categoryName: " Science ",
        isbn: "978-000",
        publisher: "Campus Press",
        totalCopies: "3",
        shelfLocation: "A-12",
        category: "Science",
        quantity: 10,
        available: 8,
        shelf: "Old Shelf",
      },
      existing,
      { createCategory: failCreate },
    );

    assert.equal(payload.title, "Physics 101");
    assert.equal(payload.author, "Ada Lovelace");
    assert.equal(payload.categoryId, "cat-science-2");
    assert.equal(payload.isbn, "978-000");
    assert.equal(payload.publisher, "Campus Press");
    assert.equal(payload.totalCopies, 3);
    assert.equal(payload.shelfLocation, "A-12");
    assert.equal("category" in payload, false);

    for (const key of FORBIDDEN_KEYS) {
      assert.equal(key in payload, false, `payload must not contain ${key}`);
    }
  });

  it("declares form keys that omit DTO-incompatible aliases", () => {
    const keys = bookFormFields().map((field) => field.key);
    assert.ok(keys.includes("categoryName"));
    assert.ok(keys.includes("totalCopies"));
    assert.ok(keys.includes("shelfLocation"));
    assert.equal(keys.includes("categoryId"), false);
    for (const key of ["category", "quantity", "available", "shelf"]) {
      assert.equal(keys.includes(key), false, `form must not declare ${key}`);
    }
  });

  it("preserves an existing book's category on edit without creating a duplicate", async () => {
    const book = {
      id: "book-1",
      title: "Grammar Workbook",
      author: "A. Teacher",
      categoryId: "cat-english-1",
      category: { id: "cat-english-1", name: "English" },
      isbn: "111",
      publisher: "Campus Press",
      totalCopies: 4,
      availableCopies: 4,
      shelfLocation: "B-2",
    };

    const form = toBookFormValues(book);
    assert.equal(form.categoryName, "English");
    assert.equal(form.categoryId, undefined);
    assert.notEqual(form.categoryName, book.categoryId);

    let creates = 0;
    const payload = await prepareBookSavePayload(form, existing, {
      createCategory: async (name) => {
        creates += 1;
        return { id: "should-not-use", name };
      },
    });

    assert.equal(creates, 0);
    assert.equal(payload.categoryId, "cat-english-1");
    assert.equal(payload.title, "Grammar Workbook");
    assert.equal(payload.totalCopies, 4);
    assert.equal(payload.shelfLocation, "B-2");
    assert.equal("category" in payload, false);
    assert.equal("categoryName" in payload, false);
  });

  it("does not put a category id into the built book payload's category field", () => {
    const payload = buildCreateBookPayload(
      { title: "X", categoryName: "English", totalCopies: 1, shelfLocation: "A" },
      "cat-english-1",
    );
    assert.equal(payload.categoryId, "cat-english-1");
    assert.equal("category" in payload, false);
    assert.equal("categoryName" in payload, false);
  });
});
