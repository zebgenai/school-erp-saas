export type ExpenseFormInput = {
  title?: string;
  categoryId?: string;
  amount?: number | string;
  date?: string;
  description?: string;
  receiptUrl?: string;
  status?: string;
  category?: unknown;
  id?: string;
  schoolId?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

export type ExpenseCategoryFormInput = {
  name?: string;
  description?: string;
  isActive?: boolean | string;
  id?: string;
  schoolId?: string;
  [key: string]: unknown;
};

function optionalString(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : undefined;
}

/** CreateExpenseDto — no status. */
export function buildCreateExpensePayload(form: ExpenseFormInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: String(form.title ?? "").trim(),
    categoryId: String(form.categoryId ?? "").trim(),
    amount: Number(form.amount) || 0,
    date: String(form.date ?? "").trim(),
  };

  const description = optionalString(form.description);
  if (description) payload.description = description;

  const receiptUrl = optionalString(form.receiptUrl);
  if (receiptUrl) payload.receiptUrl = receiptUrl;

  return payload;
}

/** UpdateExpenseDto — allows status; never nested category / ids / timestamps. */
export function buildUpdateExpensePayload(form: ExpenseFormInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    title: String(form.title ?? "").trim(),
    categoryId: String(form.categoryId ?? "").trim(),
    amount: Number(form.amount) || 0,
    date: String(form.date ?? "").trim(),
  };

  const description = optionalString(form.description);
  if (description) payload.description = description;

  const receiptUrl = optionalString(form.receiptUrl);
  if (receiptUrl) payload.receiptUrl = receiptUrl;

  const status = optionalString(form.status);
  if (status) payload.status = status;

  return payload;
}

export function buildExpensePayload(
  form: ExpenseFormInput,
  isEdit: boolean,
): Record<string, unknown> {
  return isEdit ? buildUpdateExpensePayload(form) : buildCreateExpensePayload(form);
}

/** CreateExpenseCategoryDto — name + description only. */
export function buildCreateExpenseCategoryPayload(
  form: ExpenseCategoryFormInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: String(form.name ?? "").trim(),
  };
  const description = optionalString(form.description);
  if (description) payload.description = description;
  return payload;
}

/** UpdateExpenseCategoryDto — name, description, isActive. */
export function buildUpdateExpenseCategoryPayload(
  form: ExpenseCategoryFormInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: String(form.name ?? "").trim(),
  };

  const description = optionalString(form.description);
  if (description) payload.description = description;

  if (form.isActive !== undefined && form.isActive !== "") {
    payload.isActive = form.isActive === true || form.isActive === "true";
  }

  return payload;
}

export function buildExpenseCategoryPayload(
  form: ExpenseCategoryFormInput,
  isEdit: boolean,
): Record<string, unknown> {
  return isEdit
    ? buildUpdateExpenseCategoryPayload(form)
    : buildCreateExpenseCategoryPayload(form);
}
