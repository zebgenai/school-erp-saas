import { authorizedFetch, getApiBaseUrl } from "./api";

interface BinaryRequest {
  params?: Record<string, any>;
  method?: "GET" | "POST";
  body?: unknown;
  accept?: string;
}

interface BinaryResponse {
  blob: Blob;
  /** Filename advertised by the server, when it sends one. */
  filename: string | null;
}

async function fetchBinary(path: string, req: BinaryRequest = {}): Promise<BinaryResponse> {
  let url = `${getApiBaseUrl()}${path}`;
  if (req.params) {
    const qs = new URLSearchParams();
    Object.entries(req.params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const res = await authorizedFetch(url, {
    method: req.method ?? "GET",
    headers: {
      Accept: req.accept ?? "application/pdf",
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
  });

  if (res.status === 401) {
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json")
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null);
    const msg = (data && (data.message || data.error)) || `Download failed (${res.status})`;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : String(msg));
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new Error("Download failed: the server did not return a PDF.");
  }

  const disposition = res.headers.get("content-disposition") || "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);

  return {
    blob: await res.blob(),
    filename: match ? decodeURIComponent(match[1]) : null,
  };
}

function asPdfBlob(blob: Blob): Blob {
  return blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
}

function looksLikePdf(bytes: ArrayBuffer): boolean {
  const n = Math.min(bytes.byteLength, 1024);
  if (n < 4) return false;
  const u = new Uint8Array(bytes, 0, n);
  for (let i = 0; i <= u.length - 4; i++) {
    if (u[i] === 0x25 && u[i + 1] === 0x50 && u[i + 2] === 0x44 && u[i + 3] === 0x46) {
      return true;
    }
  }
  return false;
}

async function fetchPdfBlob(path: string, params?: Record<string, any>): Promise<Blob> {
  const blob = asPdfBlob((await fetchBinary(path, { params })).blob);
  const bytes = await blob.arrayBuffer();
  if (!looksLikePdf(bytes)) {
    throw new Error("Download failed: the server did not return a PDF.");
  }
  return new Blob([bytes], { type: "application/pdf" });
}

/** Saves a blob to disk using a transient anchor. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Firefox ignores clicks on anchors that are not in the document, and revoking the
  // object URL synchronously can cancel the download before it starts.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 10_000);
}

export async function downloadPdf(
  path: string,
  filename: string,
  params?: Record<string, any>,
) {
  const blob = await fetchPdfBlob(path, params);
  saveBlob(blob, filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/**
 * Downloads the PDFs for the given invoices as a single ZIP. The server names the archive
 * after the invoices' period, so its filename is preferred over the fallback.
 */
export async function downloadInvoiceArchive(invoiceIds: string[], fallbackName: string) {
  const { blob, filename } = await fetchBinary("/pdf/fee-invoices/archive", {
    method: "POST",
    body: { invoiceIds },
    accept: "application/zip",
  });
  saveBlob(blob, filename ?? (fallbackName.endsWith(".zip") ? fallbackName : `${fallbackName}.zip`));
}

/**
 * Chrome prints a blank page when `window.print()` is called on a PDF blob tab
 * (the plugin layer is not in the document). Rasterize pages to images first.
 */
async function pdfPagesAsImages(bytes: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the document for printing.");
    await page.render({ canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL("image/jpeg", 0.92));
  }

  return images;
}

function waitForImages(doc: Document): Promise<void> {
  const pending = [...doc.images].filter((img) => !img.complete);
  if (!pending.length) return Promise.resolve();
  return Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  ).then(() => undefined);
}

export async function printPdf(path: string, params?: Record<string, any>) {
  const blob = await fetchPdfBlob(path, params);
  const bytes = await blob.arrayBuffer();

  let images: string[];
  try {
    images = await pdfPagesAsImages(bytes);
  } catch {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const opened = window.open(url, "_blank");
    if (!opened) throw new Error("Pop-up blocked. Please allow pop-ups for this site.");
    return;
  }

  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("Pop-up blocked. Please allow pop-ups for this site.");
  }

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print</title>
  <style>
    @page { size: A4; margin: 10mm; }
    html, body { margin: 0; background: #fff; }
    img { display: block; width: 100%; page-break-after: always; }
    img:last-child { page-break-after: auto; }
  </style>
</head>
<body></body>
</html>`);
  win.document.close();

  for (const src of images) {
    const img = win.document.createElement("img");
    img.src = src;
    img.alt = "";
    win.document.body.appendChild(img);
  }

  await waitForImages(win.document);
  await new Promise((r) => setTimeout(r, 150));
  win.focus();
  win.print();
}

/** Convenience helpers for common PDF endpoints */
export const pdfApi = {
  feeInvoice: (id: string, invoiceNo?: string) =>
    downloadPdf(`/pdf/fee-invoice/${id}`, `invoice-${invoiceNo ?? id}.pdf`),
  printFeeInvoice: (id: string) => printPdf(`/pdf/fee-invoice/${id}`),
  feeInvoiceArchive: (invoiceIds: string[], fallbackName: string) =>
    downloadInvoiceArchive(invoiceIds, fallbackName),
  feeReceipt: (paymentId: string, receiptNo?: string) =>
    downloadPdf(`/pdf/fee-receipt/${paymentId}`, `receipt-${receiptNo ?? paymentId}.pdf`),
  printFeeReceipt: (paymentId: string) => printPdf(`/pdf/fee-receipt/${paymentId}`),
  studentProfile: (studentId: string, admNo?: string) =>
    downloadPdf(`/pdf/student-profile/${studentId}`, `student-${admNo ?? studentId}.pdf`),
  printStudentProfile: (studentId: string) => printPdf(`/pdf/student-profile/${studentId}`),
  studentAttendance: (studentId: string, params?: Record<string, any>, admNo?: string) =>
    downloadPdf(`/pdf/student-attendance/${studentId}`, `attendance-${admNo ?? studentId}.pdf`, params),
  printStudentAttendance: (studentId: string, params?: Record<string, any>) =>
    printPdf(`/pdf/student-attendance/${studentId}`, params),
  reportCard: (examId: string, studentId: string, admNo?: string) =>
    downloadPdf(`/pdf/report-card/${examId}/${studentId}`, `report-card-${admNo ?? studentId}.pdf`),
  printReportCard: (examId: string, studentId: string) =>
    printPdf(`/pdf/report-card/${examId}/${studentId}`),
  salarySlip: (payrollId: string, label?: string) =>
    downloadPdf(`/pdf/salary-slip/${payrollId}`, `salary-slip-${label ?? payrollId}.pdf`),
  classTimetable: (classId: string, label?: string, sectionId?: string) =>
    downloadPdf(`/pdf/class-timetable/${classId}`, `timetable-${label ?? classId}.pdf`, sectionId ? { sectionId } : undefined),
  printClassTimetable: (classId: string, sectionId?: string) =>
    printPdf(`/pdf/class-timetable/${classId}`, sectionId ? { sectionId } : undefined),
  printSalarySlip: (payrollId: string) => printPdf(`/pdf/salary-slip/${payrollId}`),
  expenseReport: (params?: Record<string, any>) =>
    downloadPdf("/pdf/expense-report", "expense-report.pdf", params),
  printExpenseReport: (params?: Record<string, any>) => printPdf("/pdf/expense-report", params),
  financialReport: (params?: Record<string, any>) =>
    downloadPdf("/pdf/financial-report", "financial-report.pdf", params),
  printFinancialReport: (params?: Record<string, any>) => printPdf("/pdf/financial-report", params),
  feeDefaulters: (params?: Record<string, any>) =>
    downloadPdf("/pdf/fee-defaulters", "fee-defaulters.pdf", params),
  printFeeDefaulters: (params?: Record<string, any>) => printPdf("/pdf/fee-defaulters", params),
};
