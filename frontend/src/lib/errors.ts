import { toast } from "sonner";

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const FIELD_LABELS: Record<string, string> = {
  classId: "class",
  sectionId: "section",
  studentId: "student",
  subjectId: "subject",
  teacherId: "teacher",
  parentId: "parent",
  schoolId: "school",
  bookId: "book",
  routeId: "route",
  categoryId: "category",
  monthlyFee: "monthly fee",
  fullName: "name",
  admissionNo: "admission number",
  email: "email",
  phone: "phone",
  cnic: "CNIC",
  password: "password",
  startDate: "start date",
  endDate: "end date",
  dueDate: "due date",
  issueDate: "issue date",
  amount: "amount",
  title: "title",
  name: "name",
};

function labelForField(key: string): string {
  return FIELD_LABELS[key] || key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim().toLowerCase();
}

function humanizeOne(raw: string): string {
  let msg = raw.trim();
  if (!msg) return "Something went wrong. Please try again.";

  if (/^fetch failed$/i.test(msg) || /could not reach resend/i.test(msg) || /example\.com domain is not verified/i.test(msg) || /resend\.com\/domains/i.test(msg) || /could not send the verification/i.test(msg)) {
    return "We could not send the verification code. Please try again.";
  }

  const fieldMatch = msg.match(/^([a-zA-Z][\w]*)\s+/);
  const fieldKey = fieldMatch?.[1] ?? "";
  const field = labelForField(fieldKey);

  if (/must not be less than 0|must be a positive number|must not be negative/i.test(msg)) {
    return `${field.charAt(0).toUpperCase() + field.slice(1)} cannot be negative.`;
  }
  if (/should not be empty|must not be empty|must be defined|should not be null/i.test(msg)) {
    if (fieldKey.endsWith("Id") || field === "class" || field === "section" || field === "student") {
      return `Please select a ${field}.`;
    }
    return `Please enter ${field === "email" ? "an" : "a"} ${field}.`;
  }
  if (/must be an email|must be a valid email/i.test(msg)) {
    return "Please enter a valid email address.";
  }
  if (/must be longer than|must contain at least/i.test(msg)) {
    return "Password must be at least 8 characters.";
  }
  if (/already exists|duplicate/i.test(msg)) {
    return "This record already exists. Please use a different value.";
  }
  if (/not found/i.test(msg)) {
    return "The requested record could not be found.";
  }
  if (/forbidden|not allowed/i.test(msg)) {
    return "You do not have permission to perform this action.";
  }

  if (/^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z]*)*\s/i.test(msg) && msg.length < 120) {
    return msg.charAt(0).toUpperCase() + msg.slice(1).replace(/\.$/, "") + ".";
  }

  return msg;
}

function backendRawMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const fromData = error.data?.message;
    if (Array.isArray(fromData) && fromData.length) return String(fromData[0] ?? "");
    if (typeof fromData === "string" && fromData.trim()) return fromData;
    return String(error.message || "");
  }
  if (error instanceof Error) return error.message;
  return "";
}

export function parseLockoutMinutes(raw: string): number | null {
  const match = String(raw || "").match(/(?:try again in|locked for)\s+(\d+)\s*minute/i);
  if (!match) return null;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export function isAccountLockedMessage(raw: string): boolean {
  return /account locked|too many failed login attempts/i.test(raw);
}

export function isInactiveAccountMessage(raw: string): boolean {
  return /account is inactive|user account is inactive|account is suspended/i.test(raw);
}

function isSafeUserFacingMessage(raw: string): boolean {
  const msg = raw.trim();
  if (!msg || msg.length > 240) return false;
  if (/\n\s*at\s+/.test(msg)) return false;
  if (/prisma|sqlstate|jwt|bearer\s+[a-z0-9._-]+\.[a-z0-9._-]+|eyJ[A-Za-z0-9_-]{10,}/i.test(msg)) return false;
  if (/exception|stack trace|internal server/i.test(msg) && msg.length > 80) return false;
  return true;
}

export function formatLockedAccountMessage(raw: string): string | null {
  if (!isAccountLockedMessage(raw)) return null;
  const minutes = parseLockoutMinutes(raw);
  if (minutes != null) {
    return `\u{1F512} Account temporarily locked. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
  return "\u{1F512} Account temporarily locked. Please try again later.";
}

export type LoginErrorView = {
  kind: "locked" | "inactive" | "credentials" | "generic";
  title?: string;
  message: string;
};

export function parseLoginError(error: unknown): LoginErrorView {
  const status = error instanceof ApiError ? error.status : 0;
  const raw = backendRawMessage(error);

  if (status === 0) {
    return { kind: "generic", message: "Unable to connect. Please check your internet connection." };
  }
  if (status === 401) {
    return { kind: "credentials", message: "Invalid email or password." };
  }
  if (status === 403) {
    if (isAccountLockedMessage(raw)) {
      const minutes = parseLockoutMinutes(raw);
      return {
        kind: "locked",
        title: "\u{1F512} Account temporarily locked",
        message:
          minutes != null
            ? `Too many failed login attempts. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`
            : "Too many failed login attempts. Please try again later.",
      };
    }
    if (isInactiveAccountMessage(raw)) {
      return {
        kind: "inactive",
        title: "\u26A0\uFE0F Your account is inactive",
        message: "Please contact your administrator.",
      };
    }
    if (/another school's data/i.test(raw)) {
      return {
        kind: "generic",
        message: "This account belongs to a different school. Sign in on your school's site.",
      };
    }
    if (isSafeUserFacingMessage(raw) && !/^forbidden$/i.test(raw.trim())) {
      return { kind: "generic", message: raw.trim() };
    }
    return { kind: "generic", message: "You do not have permission to perform this action." };
  }
  if (status >= 500) {
    return { kind: "generic", message: "Something went wrong on our end. Please try again shortly." };
  }
  return { kind: "generic", message: formatApiError(error) };
}

export function formatLoginError(error: unknown): string {
  const view = parseLoginError(error);
  return view.title ? `${view.title}. ${view.message}` : view.message;
}

export function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return "Unable to connect. Please check your internet connection.";
    if (error.status === 401) return "Your session has expired. Please sign in again.";
    if (error.status === 403) {
      const raw = backendRawMessage(error);
      if (/another school's data/i.test(raw)) {
        return "This account belongs to a different school. Sign in on your school's site.";
      }
      const locked = formatLockedAccountMessage(raw);
      if (locked) return locked;
      if (isInactiveAccountMessage(raw)) {
        return "\u26A0\uFE0F Your account is inactive. Please contact your administrator.";
      }
      if (isSafeUserFacingMessage(raw) && !/^forbidden$/i.test(raw.trim())) {
        return raw.trim();
      }
      return "You do not have permission to perform this action.";
    }
    if (error.status === 404) return "The requested record could not be found.";
    if (error.status === 409) return "This record already exists or conflicts with existing data.";
    if (error.status === 429) {
      return humanizeOne(String(error.message || "Too many attempts. Please wait a moment and try again."));
    }
    if (error.status >= 500) return "Something went wrong on our end. Please try again shortly.";

    const raw = error.message;
    if (Array.isArray(error.data?.message)) {
      return humanizeOne(String(error.data.message[0]));
    }
    return humanizeOne(raw);
  }
  if (error instanceof Error && error.message) return humanizeOne(error.message);
  return "Something went wrong. Please try again.";
}

export function toastSuccess(message: string) {
  toast.success(message);
}

export function toastError(error: unknown, fallback = "Something went wrong. Please try again.") {
  toast.error(formatApiError(error) || fallback);
}

export function toastWarning(message: string) {
  toast.warning(message);
}

export function toastInfo(message: string) {
  toast.info(message);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export function isValidCnic(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 13;
}

export function isFutureDate(value: string): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d > today;
}

export function isPastDate(value: string): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return d < today;
}
