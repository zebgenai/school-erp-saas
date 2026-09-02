import { MONTHS, drawFooter, drawHeader, drawTable, fmtDate, keyValueGrid, money, sectionTitle } from '../pdf-base';
import { PdfMeta, SchoolPdfInfo } from '../pdf.types';

type PdfDoc = PDFKit.PDFDocument;

export function renderFeeInvoice(
  doc: PdfDoc,
  school: SchoolPdfInfo,
  meta: PdfMeta,
  invoice: any,
) {
  drawHeader(doc, school, meta);
  const st = invoice.student;
  sectionTitle(doc, 'Student Information');
  keyValueGrid(doc, [
    ['Name', st?.fullName ?? '—'],
    ['Admission No', st?.admissionNo ?? '—'],
    ['Class', st?.class?.name ?? '—'],
    ['Section', st?.section?.name ?? '—'],
  ]);

  sectionTitle(doc, 'Invoice Details');
  const balance = invoice.totalAmount - invoice.paidAmount;
  drawTable(doc,
    ['Description', 'Amount'],
    [
      ['Monthly Fee', money(invoice.amount)],
      ...(invoice.discount ? [['Discount', `- ${money(invoice.discount)}`]] : []),
      ...(invoice.fine ? [['Fine / Surcharge', `+ ${money(invoice.fine)}`]] : []),
      ['Total Payable', money(invoice.totalAmount)],
      ['Amount Paid', money(invoice.paidAmount)],
      ['Balance Due', money(Math.max(balance, 0))],
    ],
    [350, 149],
  );

  doc.font('Helvetica').fontSize(9).fillColor('#64748b')
    .text(`Period: ${MONTHS[(invoice.month ?? 1) - 1]} ${invoice.year}  ·  Status: ${invoice.status}`, 48, doc.y);
  if (invoice.dueDate) doc.text(`Due Date: ${fmtDate(invoice.dueDate)}`, 48, doc.y + 12);

  const payments = invoice.payments ?? [];
  if (payments.length > 0) {
    sectionTitle(doc, 'Payment History');
    drawTable(doc,
      ['Date', 'Amount', 'Method', 'Receipt'],
      payments.map((p: any) => [
        fmtDate(p.paymentDate),
        money(p.amount),
        p.method ?? '—',
        p.receiptNo ?? '—',
      ]),
      [120, 100, 100, 179],
    );
  }
  drawFooter(doc);
}

export function renderFeeReceipt(doc: PdfDoc, school: SchoolPdfInfo, meta: PdfMeta, payment: any) {
  drawHeader(doc, school, meta);
  const inv = payment.invoice;
  const st = inv?.student;
  sectionTitle(doc, 'Payment Received');
  keyValueGrid(doc, [
    ['Receipt No', payment.receiptNo],
    ['Payment Date', fmtDate(payment.paymentDate)],
    ['Method', payment.method ?? '—'],
    ['Amount Received', money(payment.amount)],
  ]);

  sectionTitle(doc, 'Student & Invoice');
  keyValueGrid(doc, [
    ['Student', st?.fullName ?? '—'],
    ['Admission No', st?.admissionNo ?? '—'],
    ['Invoice No', inv?.invoiceNo ?? '—'],
    ['Invoice Period', inv ? `${MONTHS[(inv.month ?? 1) - 1]} ${inv.year}` : '—'],
  ]);

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#16a34a')
    .text(`Amount Paid: ${money(payment.amount)}`, { align: 'center' });
  drawFooter(doc);
}
