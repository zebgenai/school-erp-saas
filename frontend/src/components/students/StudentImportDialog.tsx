import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button, Select } from "@/components/form";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/lib/auth";
import { toastError, toastSuccess } from "@/lib/errors";
import {
  clientFileProblem,
  downloadStudentTemplate,
  downloadTextFile,
  formatFileSize,
  importActionState,
  postStudentImport,
  type StudentImportPreview,
} from "@/lib/student-import";

const POLICY =
  "Duplicates are skipped. Clever Campus matches students by admission number inside your school. Existing students are never overwritten, and their class or personal details stay as they are.";

export function StudentImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { user } = useAuth();
  const needsSchool = user?.role === "SUPER_ADMIN" && !user.schoolId;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [schoolId, setSchoolId] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [mapping, setMapping] = useState<Array<string | null>>([]);
  const [dirty, setDirty] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [done, setDone] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping([]);
    setDirty(false);
    setProgress(null);
    setBusy(null);
    setDone(false);
    setDragOver(false);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const chooseFile = (next: File | null) => {
    if (!next || busy) return;
    const problem = clientFileProblem(next);
    if (problem) {
      toastError(new Error(problem), problem);
      return;
    }
    setFile(next);
    setPreview(null);
    setMapping([]);
    setDirty(false);
    setDone(false);
    void runPreview(next, null);
  };

  const runPreview = async (target: File, nextMapping: Array<string | null> | null) => {
    setBusy("preview");
    setProgress(0);
    try {
      const result = await postStudentImport(
        "/students/import/preview",
        target,
        nextMapping,
        needsSchool ? schoolId.trim() || undefined : undefined,
        setProgress,
      );
      setPreview(result);
      setMapping(result.mapping);
      setDirty(false);
      setDone(false);
    } catch (error) {
      toastError(error, "Could not read this file");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const runImport = async () => {
    if (!file || !preview) return;
    setBusy("import");
    setProgress(0);
    try {
      const result = await postStudentImport(
        "/students/import",
        file,
        mapping,
        needsSchool ? schoolId.trim() || undefined : undefined,
        setProgress,
      );
      setPreview(result);
      setDone(true);
      setDirty(false);
      if (result.created > 0) {
        toastSuccess(
          result.created === 1 ? "1 student imported" : `${result.created} students imported`,
        );
        onImported();
      } else {
        toastError(new Error("No students were imported."), "No students were imported");
      }
    } catch (error) {
      toastError(error, "Import failed");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const actions = importActionState({
    readyToImport: Boolean(preview?.readyToImport),
    dirty,
    busy: busy != null,
  });
  const report = preview?.errorReportCsv ?? "";
  const hasReport =
    report
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim()).length > 1;

  return (
    <Modal
      open={open}
      onClose={close}
      preventClose={busy != null}
      size="xl"
      title="Import students"
      description="Upload an Excel or CSV file, check the column mapping, then import valid rows."
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy != null}>
            {done ? "Done" : "Cancel"}
          </Button>
          {preview && !done && (dirty || !preview.mappingReady) && (
            <Button
              variant="secondary"
              disabled={!actions.canValidate || !file}
              loading={busy === "preview"}
              onClick={() => file && runPreview(file, mapping)}
            >
              Check rows
            </Button>
          )}
          {!done && (
            <Button disabled={!actions.canImport} loading={busy === "import"} onClick={runImport}>
              Import valid students
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{POLICY}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadStudentTemplate().catch((error) =>
                toastError(error, "Could not download the template"),
              )
            }
          >
            <Download className="size-4" /> Download Excel Template
          </Button>
        </div>

        {needsSchool && (
          <label className="block text-sm">
            <span className="font-medium">School ID</span>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm"
              value={schoolId}
              onChange={(event) => {
                setSchoolId(event.target.value);
                setDirty(true);
              }}
              placeholder="School to import into"
              autoComplete="off"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Super admin imports use this school. The spreadsheet cannot choose a different school.
            </span>
          </label>
        )}

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            chooseFile(event.dataTransfer.files?.[0] ?? null);
          }}
          className={`rounded-2xl border border-dashed p-6 text-center transition ${
            dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
          }`}
        >
          <Upload className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">Drop an .xlsx or .csv file here</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Maximum 5 MB and 3,000 students. Formulas are not imported.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => inputRef.current?.click()}
            disabled={busy != null}
          >
            <FileSpreadsheet className="size-4" /> Choose file
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              chooseFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </div>

        {file && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-medium">{file.name}</div>
              <div className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
                {preview?.sheetName ? ` · ${preview.sheetName}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="size-8 grid place-items-center rounded-lg hover:bg-muted"
              aria-label="Remove file"
              disabled={busy != null}
              onClick={reset}
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {progress != null && (
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {preview && (
          <>
            {preview.mappingErrors.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {preview.mappingErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Column mapping</h4>
              <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                {preview.headers.map((header, index) => (
                  <div
                    key={`${header}-${index}`}
                    className="grid gap-2 sm:grid-cols-2 sm:items-center"
                  >
                    <div className="truncate text-sm">
                      <span className="font-medium">{header || `Column ${index + 1}`}</span>
                      {preview.suggestedMapping[index] && (
                        <span className="ml-2 text-xs text-muted-foreground">suggested</span>
                      )}
                    </div>
                    <Select
                      aria-label={`Map ${header || `column ${index + 1}`}`}
                      value={mapping[index] ?? ""}
                      disabled={busy != null || done}
                      onChange={(event) => {
                        const next = [...mapping];
                        next[index] = event.target.value || null;
                        setMapping(next);
                        setDirty(true);
                        setDone(false);
                      }}
                    >
                      <option value="">Choose a field…</option>
                      <option value="__ignore">Don't import</option>
                      {preview.fields.map((field) => (
                        <option key={field.key} value={field.key}>
                          {field.label}
                          {field.required ? " (required)" : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
              {preview.mappingNotes.length > 0 && (
                <ul className="text-xs text-muted-foreground">
                  {preview.mappingNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </div>

            {preview.mappingReady && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Rows" value={preview.totalRows} />
                <Stat label="Valid" value={preview.validCount} />
                <Stat label="Errors" value={done ? preview.failed : preview.errorCount} />
                <Stat
                  label="Duplicates"
                  value={done ? preview.skippedDuplicates : preview.duplicateCount}
                />
              </div>
            )}

            {done && (
              <div className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-sm">
                <p className="font-medium">
                  Created {preview.created}. Skipped {preview.skippedDuplicates} duplicates.
                  Rejected {preview.failed} rows.
                </p>
                {preview.createdSample.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    New admission numbers include {preview.createdSample.join(", ")}.
                  </p>
                )}
                {preview.feeWarnings.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    {preview.feeWarnings.length} student
                    {preview.feeWarnings.length === 1 ? "" : "s"} saved without a fee invoice.
                  </p>
                )}
              </div>
            )}

            {preview.previewRows.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Row</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Admission</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Class</th>
                      <th className="px-3 py-2 font-medium text-muted-foreground">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.previewRows.map((row) => (
                      <tr key={row.rowNumber} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.values.admissionNo || "—"}</td>
                        <td className="px-3 py-2">{row.values.fullName || "—"}</td>
                        <td className="px-3 py-2">
                          {row.values.className || "—"}
                          {row.values.sectionName ? ` · ${row.values.sectionName}` : ""}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.duplicate?.message ||
                            row.errors[0]?.message ||
                            row.warnings[0] ||
                            (row.status === "valid" ? "Ready to import" : row.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.previewTruncated && (
              <p className="text-xs text-muted-foreground">
                Showing the first rows. Download the error report for every problem row.
              </p>
            )}

            {hasReport && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadTextFile("student-import-errors.csv", report)}
              >
                <Download className="size-4" /> Download error report
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
