import { drawFooter, drawHeader, drawTable, keyValueGrid } from '../pdf-base';
import { PdfMeta, SchoolPdfInfo } from '../pdf.types';

export const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface TimetablePdfEntry {
  dayOfWeek: number;
  periodNo: number;
  startTime: string;
  endTime: string;
  roomNo?: string | null;
  subject?: { name: string } | null;
  teacher?: { fullName: string } | null;
}

export interface TimetablePdfData {
  className: string;
  sectionName?: string | null;
  entries: TimetablePdfEntry[];
}

export function renderClassTimetable(
  doc: PDFKit.PDFDocument,
  school: SchoolPdfInfo,
  meta: PdfMeta,
  data: TimetablePdfData,
) {
  drawHeader(doc, school, meta);

  keyValueGrid(doc, [
    ['Class', data.className],
    ['Section', data.sectionName || 'All sections'],
  ]);

  // Days are limited to those actually in use so a Mon–Fri school does not print empty
  // weekend columns.
  const days = [...new Set(data.entries.map((e) => e.dayOfWeek))].sort((a, b) => a - b);
  const periods = [...new Set(data.entries.map((e) => e.periodNo))].sort((a, b) => a - b);

  if (periods.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#64748b')
      .text('No timetable entries have been scheduled for this class yet.');
    drawFooter(doc);
    return;
  }

  const bySlot = new Map<string, TimetablePdfEntry>();
  for (const entry of data.entries) {
    bySlot.set(`${entry.dayOfWeek}-${entry.periodNo}`, entry);
  }

  const headers = ['Period', ...days.map((d) => DAY_LABELS[d] ?? `Day ${d}`)];
  const rows = periods.map((period) => {
    const cells = days.map((day) => {
      const entry = bySlot.get(`${day}-${period}`);
      if (!entry) return '—';
      return [
        entry.subject?.name ?? 'Unassigned',
        entry.teacher?.fullName,
        `${entry.startTime}-${entry.endTime}`,
      ]
        .filter(Boolean)
        .join(' | ');
    });
    return [`P${period}`, ...cells];
  });

  const periodColWidth = 44;
  const dayColWidth = (499 - periodColWidth) / days.length;
  drawTable(doc, headers, rows, [periodColWidth, ...days.map(() => dayColWidth)]);

  drawFooter(doc);
}
