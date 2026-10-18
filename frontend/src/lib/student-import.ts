import { ApiError, authorizedFetch, getApiBaseUrl, tokenStore } from "./api";

export {
  MAX_STUDENT_IMPORT_BYTES,
  clientFileProblem,
  formatFileSize,
  importActionState,
} from "./student-import-rules";

export type ImportFieldOption = { key: string; label: string; required: boolean };

export type ImportPreviewRow = {
  rowNumber: number;
  status: "valid" | "error" | "duplicate" | "example";
  values: Record<string, string | undefined>;
  errors: { field: string; message: string }[];
  warnings: string[];
  duplicate?: {
    field: string;
    source: "file" | "database";
    message: string;
    relatedRow?: number;
  } | null;
};

export type StudentImportPreview = {
  fileName: string;
  fileSize: number;
  sheetName: string;
  headers: string[];
  fields: ImportFieldOption[];
  suggestedMapping: Array<string | null>;
  mapping: Array<string | null>;
  mappingErrors: string[];
  mappingNotes: string[];
  mappingReady: boolean;
  readyToImport: boolean;
  duplicatePolicy: string;
  notes: string[];
  totalRows: number;
  blankRowsSkipped: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  exampleCount: number;
  warningCount: number;
  created: number;
  skippedDuplicates: number;
  failed: number;
  feeWarnings: { rowNumber: number; message: string }[];
  createdSample: string[];
  previewRows: ImportPreviewRow[];
  previewTruncated: boolean;
  issues: ImportPreviewRow[];
  issuesTruncated: boolean;
  errorReportCsv: string;
};

export function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadStudentTemplate() {
  const res = await authorizedFetch(`${getApiBaseUrl()}/students/import/template`);
  if (!res.ok) {
    let message = "Could not download the template";
    try {
      const data = await res.json();
      if (data?.message) message = Array.isArray(data.message) ? data.message[0] : data.message;
    } catch {
      /* keep the fallback message */
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clever-campus-student-import-template.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function postStudentImport(
  path: "/students/import/preview" | "/students/import",
  file: File,
  mapping: Array<string | null> | null,
  schoolId: string | undefined,
  onProgress?: (percent: number) => void,
): Promise<StudentImportPreview> {
  const send = (retry: boolean) =>
    new Promise<StudentImportPreview>((resolve, reject) => {
      const url = new URL(`${getApiBaseUrl()}${path}`);
      if (schoolId) url.searchParams.set("schoolId", schoolId);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url.toString());
      const token = tokenStore.get();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
        }
      };
      xhr.onload = () => {
        const data = parseBody(xhr.responseText);
        if (xhr.status === 401 && !retry) {
          void refreshAccessToken().then((ok) => {
            if (!ok) {
              reject(new ApiError("Unauthorized", 401, data));
              return;
            }
            send(true).then(resolve, reject);
          });
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as StudentImportPreview);
          return;
        }
        const message = data?.message || `Request failed (${xhr.status})`;
        reject(
          new ApiError(Array.isArray(message) ? message[0] : String(message), xhr.status, data),
        );
      };
      xhr.onerror = () => reject(new ApiError("Network error", 0));
      const body = new FormData();
      body.append("file", file);
      if (mapping) body.append("mapping", JSON.stringify(mapping));
      xhr.send(body);
    });
  return send(false);
}

function parseBody(raw: string): { message?: string | string[] } | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.accessToken) tokenStore.set(data.accessToken);
    if (data.refreshToken) tokenStore.setRefresh(data.refreshToken);
    return Boolean(data.accessToken);
  } catch {
    return false;
  }
}
