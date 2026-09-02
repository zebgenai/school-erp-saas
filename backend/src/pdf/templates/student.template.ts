import { drawFooter, drawHeader, drawTable, fmtDate, keyValueGrid, money, sectionTitle } from '../pdf-base';
import { PdfMeta, SchoolPdfInfo } from '../pdf.types';

type PdfDoc = PDFKit.PDFDocument;

export function renderStudentProfile(doc: PdfDoc, school: SchoolPdfInfo, meta: PdfMeta, student: any) {
  drawHeader(doc, school, meta);
  sectionTitle(doc, 'Personal Information');
  keyValueGrid(doc, [
    ['Full Name', student.fullName],
    ['Admission No', student.admissionNo],
    ['Admission Date', fmtDate(student.admissionDate)],
    ['Gender', student.gender ?? '—'],
    ['Date of Birth', fmtDate(student.dateOfBirth)],
    ['Status', student.status],
    ['Father / Guardian', student.fatherName ?? '—'],
    ['Phone', student.guardianPhone ?? '—'],
    ['WhatsApp', student.whatsappNumber ?? '—'],
  ]);

  sectionTitle(doc, 'Academic Information');
  keyValueGrid(doc, [
    ['Class', student.class?.name ?? '—'],
    ['Section', student.section?.name ?? '—'],
    ['Monthly Fee', money(student.monthlyFee ?? 0)],
    ['Address', student.address ?? '—'],
  ], 1);

  const parents = student.parents ?? [];
  if (parents.length > 0) {
    sectionTitle(doc, 'Linked Parents');
    drawTable(doc,
      ['Name', 'Phone', 'Email'],
      parents.map((p: any) => [p.fullName, p.phone ?? '—', p.email ?? '—']),
      [180, 120, 199],
    );
  }
  drawFooter(doc);
}

export function renderAttendanceReport(
  doc: PdfDoc,
  school: SchoolPdfInfo,
  meta: PdfMeta,
  data: { student: any; summary: any; records: any[]; startDate: string; endDate: string },
) {
  drawHeader(doc, school, meta);
  sectionTitle(doc, 'Student');
  keyValueGrid(doc, [
    ['Name', data.student.fullName],
    ['Admission No', data.student.admissionNo],
    ['Class', data.student.class?.name ?? '—'],
    ['Section', data.student.section?.name ?? '—'],
    ['Period', `${data.startDate} to ${data.endDate}`],
  ]);

  sectionTitle(doc, 'Summary');
  keyValueGrid(doc, [
    ['Present', String(data.summary.present ?? 0)],
    ['Absent', String(data.summary.absent ?? 0)],
    ['Late', String(data.summary.late ?? 0)],
    ['Leave', String(data.summary.leave ?? 0)],
    ['Total Days', String(data.summary.total ?? 0)],
    ['Attendance %', `${data.summary.rate ?? 0}%`],
  ]);

  sectionTitle(doc, 'Daily Records');
  drawTable(doc,
    ['Date', 'Status', 'Remarks'],
    data.records.map((r) => [fmtDate(r.date), r.status, r.remarks ?? '—']),
    [120, 80, 299],
  );
  drawFooter(doc);
}

export function renderReportCard(doc: PdfDoc, school: SchoolPdfInfo, meta: PdfMeta, result: any) {
  drawHeader(doc, school, meta);
  const st = result.student;
  sectionTitle(doc, 'Student Information');
  keyValueGrid(doc, [
    ['Name', st.fullName ?? '—'],
    ['Admission No', st.admissionNo ?? '—'],
    ['Class', result.exam?.class?.name ?? st.class?.name ?? '—'],
    ['Section', st.section?.name ?? '—'],
    ['Exam', result.exam?.name ?? '—'],
    ['Position', result.position ? `#${result.position}` : '—'],
  ]);

  sectionTitle(doc, 'Subject Marks');
  const subjects = result.subjects ?? [];
  drawTable(doc,
    ['Subject', 'Obtained', 'Total', 'Remarks'],
    subjects.map((s: any) => [
      s.subjectName ?? s.subject?.name ?? '—',
      String(s.obtainedMarks ?? s.obtained ?? '—'),
      String(s.totalMarks ?? s.total ?? '—'),
      s.remarks ?? s.grade ?? '—',
    ]),
    [180, 80, 80, 159],
  );

  sectionTitle(doc, 'Overall Result');
  keyValueGrid(doc, [
    ['Total Marks', String(result.totalMarks ?? '—')],
    ['Obtained Marks', String(result.obtainedMarks ?? '—')],
    ['Percentage', `${result.percentage ?? 0}%`],
    ['Grade', result.grade ?? '—'],
    ['Result', result.resultStatus ?? '—'],
    ...(result.remarks ? [['Remarks', result.remarks]] as [string, string][] : []),
  ], result.remarks ? 2 : 3);
  drawFooter(doc);
}
