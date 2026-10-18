export const MAX_STUDENT_IMPORT_BYTES = 5 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function clientFileProblem(file: { name: string; size: number }): string | null {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "xls" || ext === "xlsm" || ext === "xlsb") {
    return "This Excel format is not supported. Save the file as .xlsx or .csv and upload it again.";
  }
  if (ext !== "xlsx" && ext !== "csv") return "Only .xlsx and .csv files are supported.";
  if (file.size <= 0) return "The file is empty.";
  if (file.size > MAX_STUDENT_IMPORT_BYTES) return "File is too large. Maximum size is 5 MB.";
  return null;
}

export function importActionState(input: {
  readyToImport: boolean;
  dirty: boolean;
  busy: boolean;
}) {
  return {
    canValidate: !input.busy,
    canImport: input.readyToImport && !input.dirty && !input.busy,
  };
}
