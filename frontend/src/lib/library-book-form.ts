export type LibraryCategory = {
  id: string;
  name: string;
};

export type CategorySelectOption = {
  value: string;
  label: string;
};

export type BookFormField = {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: CategorySelectOption[];
  required?: boolean;
};

/** Maps GET /library/categories rows to CrudPage select options. */
export function categorySelectOptions(categories: LibraryCategory[]): CategorySelectOption[] {
  return categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));
}

/** Field keys posted by Add/Edit Book. Must match CreateBookDto (no aliases). */
export function bookFormFields(categoryOptions: CategorySelectOption[]): BookFormField[] {
  return [
    { key: "title", label: "Title", required: true },
    { key: "author", label: "Author" },
    { key: "categoryId", label: "Category", type: "select", required: true, options: categoryOptions },
    { key: "isbn", label: "ISBN" },
    { key: "publisher", label: "Publisher" },
    { key: "totalCopies", label: "Total Quantity", type: "number" },
    { key: "shelfLocation", label: "Shelf / Location" },
  ];
}

/**
 * Builds the POST /library/books body the same way CrudForm does:
 * only declared field keys, numbers coerced.
 */
export function buildCreateBookPayload(
  form: Record<string, unknown>,
  fields: BookFormField[] = bookFormFields([]),
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const fd of fields) {
    payload[fd.key] = fd.type === "number" ? Number(form[fd.key]) || 0 : form[fd.key];
  }
  return payload;
}
