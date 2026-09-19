export type LibraryCategory = {
  id: string;
  name: string;
};

export type BookFormField = {
  key: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  placeholder?: string;
  suggestions?: string[];
  viewValue?: (row: any) => string;
};

export type ResolveCategoryDeps = {
  createCategory: (name: string) => Promise<LibraryCategory>;
  listCategories?: () => Promise<LibraryCategory[]>;
};

export function normalizeCategoryName(name: string): string {
  return name.trim();
}

export function findCategoryByName(
  categories: LibraryCategory[],
  typed: string,
): LibraryCategory | undefined {
  const needle = normalizeCategoryName(typed).toLowerCase();
  if (!needle) return undefined;
  return categories.find((category) => normalizeCategoryName(category.name).toLowerCase() === needle);
}

export function categoryNameSuggestions(categories: LibraryCategory[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const category of categories) {
    const name = normalizeCategoryName(category.name);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** Typed category field for Add/Edit Book. POST body is built by prepareBookSavePayload. */
export function bookFormFields(suggestions: string[] = []): BookFormField[] {
  return [
    { key: "title", label: "Title", required: true },
    { key: "author", label: "Author" },
    {
      key: "categoryName",
      label: "Category",
      required: true,
      placeholder: "e.g. English",
      suggestions,
      viewValue: (row: any) => row?.category?.name || "—",
    },
    { key: "isbn", label: "ISBN" },
    { key: "publisher", label: "Publisher" },
    { key: "totalCopies", label: "Total Quantity", type: "number" },
    { key: "shelfLocation", label: "Shelf / Location" },
  ];
}

export function toBookFormValues(row: Record<string, any> | null | undefined): Record<string, unknown> {
  if (!row) return {};
  return {
    title: row.title ?? "",
    author: row.author ?? "",
    categoryName: row.category?.name ?? "",
    isbn: row.isbn ?? "",
    publisher: row.publisher ?? "",
    totalCopies: row.totalCopies ?? "",
    shelfLocation: row.shelfLocation ?? "",
  };
}

/**
 * Resolve a typed category name to an existing BookCategory id, creating one
 * only when no case/whitespace-insensitive match exists. Runs on submit, not
 * while typing.
 */
export async function resolveCategoryId(
  typedName: string,
  categories: LibraryCategory[],
  deps: ResolveCategoryDeps,
): Promise<string> {
  const name = normalizeCategoryName(typedName);
  if (!name) throw new Error("Category is required");

  const local = findCategoryByName(categories, name);
  if (local) return local.id;

  if (deps.listCategories) {
    const latest = await deps.listCategories();
    const remote = findCategoryByName(latest, name);
    if (remote) return remote.id;
  }

  try {
    const created = await deps.createCategory(name);
    return created.id;
  } catch (err) {
    if (deps.listCategories) {
      const latest = await deps.listCategories();
      const retry = findCategoryByName(latest, name);
      if (retry) return retry.id;
    }
    throw err;
  }
}

/**
 * Maps UI quantity to CreateBookDto.totalCopies.
 * Blank → default 1 (matches backend `dto.totalCopies ?? 1`).
 * Never emits 0 / NaN (backend @Min(1)).
 */
export function resolveTotalCopies(value: unknown): number {
  if (value === "" || value === null || value === undefined) return 1;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Builds the POST/PATCH /library/books body: CreateBookDto keys only.
 * `categoryName` is resolved to `categoryId` and never sent.
 */
export function buildCreateBookPayload(
  form: Record<string, unknown>,
  categoryId: string,
  fields: BookFormField[] = bookFormFields(),
): Record<string, unknown> {
  const payload: Record<string, unknown> = { categoryId };
  for (const fd of fields) {
    if (fd.key === "categoryName") continue;
    if (fd.key === "totalCopies") {
      payload.totalCopies = resolveTotalCopies(form.totalCopies);
      continue;
    }
    payload[fd.key] = fd.type === "number" ? Number(form[fd.key]) || 0 : form[fd.key];
  }
  return payload;
}

export async function prepareBookSavePayload(
  form: Record<string, unknown>,
  categories: LibraryCategory[],
  deps: ResolveCategoryDeps,
): Promise<Record<string, unknown>> {
  const categoryId = await resolveCategoryId(String(form.categoryName ?? ""), categories, deps);
  return buildCreateBookPayload(form, categoryId);
}
