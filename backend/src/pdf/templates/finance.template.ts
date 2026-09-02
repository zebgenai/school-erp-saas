import { MONTHS, drawFooter, drawHeader, drawTable, keyValueGrid, money, sectionTitle, fmtDate } from '../pdf-base';
import { PdfMeta, SchoolPdfInfo } from '../pdf.types';

type PdfDoc = PDFKit.PDFDocument;

export function renderSalarySlip(doc: PdfDoc, school: SchoolPdfInfo, meta: PdfMeta, payroll: any) {
  drawHeader(doc, school, meta);
  sectionTitle(doc, 'Employee Details');
  const role = payroll.staffType === 'TEACHER' ? 'Teacher' : 'Staff';
  keyValueGrid(doc, [
    ['Name', payroll.staffName],
    ['Role', role],
    ['Designation', payroll.staff?.designation ?? role],
    ['Department', payroll.staff?.department ?? '—'],
    ['Month', `${MONTHS[(payroll.month ?? 1) - 1]} ${payroll.year}`],
    ['Payment Status', payroll.status],
    ['Paid On', payroll.paidAt ? fmtDate(payroll.paidAt) : '—'],
    ['Contact', payroll.teacher?.phone ?? payroll.teacher?.email ?? '—'],
  ]);

  sectionTitle(doc, 'Salary Breakdown');
  drawTable(doc,
    ['Description', 'Amount'],
    [
      ['Basic Salary', money(payroll.basicSalary)],
      ['Allowances', money(payroll.allowances ?? 0)],
      ['Deductions', `- ${money(payroll.deductions ?? 0)}`],
      ['Net Salary', money(payroll.netSalary)],
    ],
    [350, 149],
  );

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#4f46e5')
    .text(`Net Pay: ${money(payroll.netSalary)}`, { align: 'center' });
  drawFooter(doc);
}

export function renderExpenseReport(
  doc: PdfDoc,
  school: SchoolPdfInfo,
  meta: PdfMeta,
  report: any,
) {
  drawHeader(doc, school, meta);
  sectionTitle(doc, 'Period Summary');
  keyValueGrid(doc, [
    ['Month', `${MONTHS[(report.month ?? 1) - 1]} ${report.year}`],
    ['Total Expenses', money(report.summary?.totalAmount ?? 0)],
    ['Transactions', String(report.summary?.totalCount ?? 0)],
  ]);

  if (report.byCategory?.length) {
    sectionTitle(doc, 'By Category');
    drawTable(doc,
      ['Category', 'Count', 'Total'],
      report.byCategory.map((c: any) => [c.categoryName, String(c.count), money(c.total)]),
      [250, 80, 169],
    );
  }

  sectionTitle(doc, 'Expense Details');
  drawTable(doc,
    ['Date', 'Category', 'Description', 'Amount'],
    (report.expenses ?? []).slice(0, 40).map((e: any) => [
      fmtDate(e.date),
      e.category?.name ?? '—',
      (e.description ?? e.title ?? '—').slice(0, 40),
      money(e.amount),
    ]),
    [80, 100, 219, 100],
  );
  drawFooter(doc);
}

export function renderFinancialReport(
  doc: PdfDoc,
  school: SchoolPdfInfo,
  meta: PdfMeta,
  report: any,
  month?: number,
) {
  drawHeader(doc, school, meta);
  const title = month
    ? `${MONTHS[month - 1]} ${report.year}`
    : `Year ${report.year}`;
  sectionTitle(doc, `Financial Summary — ${title}`);

  const row = month
    ? report.months?.find((m: any) => m.month === month)
    : report.totals;

  if (row) {
    keyValueGrid(doc, [
      ['Revenue (Fees Collected)', money(row.revenue ?? 0)],
      ['Operating Expenses', money(row.expenses ?? 0)],
      ['Payroll Cost', money(row.salary ?? 0)],
      ['Total Outflow', money((row.expenses ?? 0) + (row.salary ?? 0))],
      ['Net Profit / Loss', money(row.profit ?? 0)],
    ], 1);
  }

  if (!month && report.months?.length) {
    sectionTitle(doc, 'Monthly Breakdown');
    drawTable(doc,
      ['Month', 'Revenue', 'Expenses', 'Payroll', 'Profit'],
      report.months.map((m: any) => [
        MONTHS[m.month - 1],
        money(m.revenue),
        money(m.expenses),
        money(m.salary),
        money(m.profit),
      ]),
      [90, 102, 102, 102, 103],
    );
  }
  drawFooter(doc);
}

export function renderFeeDefaulters(
  doc: PdfDoc,
  school: SchoolPdfInfo,
  meta: PdfMeta,
  defaulters: any[],
  period: string,
) {
  drawHeader(doc, school, meta);
  sectionTitle(doc, `Fee Defaulters — ${period}`);
  keyValueGrid(doc, [
    ['Total Defaulters', String(defaulters.length)],
    ['Total Pending', money(defaulters.reduce((s, d) => s + (d.pendingAmount ?? 0), 0))],
  ]);

  drawTable(doc,
    ['Student', 'Adm No', 'Class', 'Invoice', 'Pending', 'Status'],
    defaulters.map((d) => [
      d.studentName,
      d.admissionNo ?? '—',
      [d.className, d.sectionName].filter(Boolean).join(' ') || '—',
      d.invoiceNo ?? '—',
      money(d.pendingAmount ?? 0),
      d.status ?? '—',
    ]),
    [120, 70, 80, 80, 80, 69],
  );
  drawFooter(doc);
}
