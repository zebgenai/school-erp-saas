import PDFDocument from 'pdfkit';
import { resolveUploadDiskPath } from '../common/utils/upload-path';
import { PdfMeta, SchoolPdfInfo } from './pdf.types';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function money(n: number) {
  return `PKR ${Number(n || 0).toLocaleString('en-PK')}`;
}

export function fmtDate(d?: Date | string | null) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function createPdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

export function drawHeader(doc: PDFKit.PDFDocument, school: SchoolPdfInfo, meta: PdfMeta) {
  const top = doc.y;
  const logo = resolveUploadDiskPath(school.logoUrl);

  if (logo) {
    try {
      doc.image(logo, 48, top, { width: 52, height: 52, fit: [52, 52] });
    } catch {
      /* ignore bad image */
    }
  }

  const textX = logo ? 110 : 48;
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1e293b')
    .text(school.name, textX, top, { width: 320 });
  doc.font('Helvetica').fontSize(9).fillColor('#64748b');
  let infoY = top + 20;
  if (school.address) {
    doc.text(school.address, textX, infoY, { width: 280 });
    infoY += 12;
  }
  const contact = [school.phone, school.email].filter(Boolean).join(' · ');
  if (contact) doc.text(contact, textX, infoY, { width: 280 });

  doc.font('Helvetica-Bold').fontSize(13).fillColor('#4f46e5')
    .text(meta.title, 350, top, { width: 197, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor('#64748b')
    .text(`Doc No: ${meta.docNo}`, 350, top + 18, { width: 197, align: 'right' })
    .text(`Generated: ${fmtDate(meta.generatedAt ?? new Date())}`, 350, top + 32, { width: 197, align: 'right' });

  doc.moveTo(48, top + 58).lineTo(547, top + 58).strokeColor('#e2e8f0').stroke();
  doc.y = top + 68;
}

export function drawFooter(doc: PDFKit.PDFDocument, label = 'Clever Campus ERP') {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
      .text(`${label} · Page ${i + 1} of ${range.count}`, 48, 780, { width: 499, align: 'center' });
  }
}

export function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e293b').text(title);
  doc.moveDown(0.3);
}

export function keyValueGrid(doc: PDFKit.PDFDocument, rows: [string, string][], cols = 2) {
  const colW = (499) / cols;
  let x = 48;
  let y = doc.y;
  rows.forEach(([k, v], i) => {
    if (i > 0 && i % cols === 0) {
      y += 28;
      x = 48;
    }
    doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(k, x, y, { width: colW - 8 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e293b').text(v, x, y + 10, { width: colW - 8 });
    x += colW;
  });
  doc.y = y + 36;
}

export function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  colWidths?: number[],
) {
  const tableWidth = 499;
  const widths = colWidths ?? headers.map(() => tableWidth / headers.length);
  const startX = 48;
  let y = doc.y;

  const drawRow = (cells: string[], header = false) => {
    const h = header ? 22 : 20;
    if (y + h > 750) {
      doc.addPage();
      y = 48;
    }
    let x = startX;
    cells.forEach((cell, i) => {
      if (header) {
        doc.rect(x, y, widths[i], h).fill('#f1f5f9');
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8);
      } else {
        doc.rect(x, y, widths[i], h).strokeColor('#e2e8f0').stroke();
        doc.fillColor('#1e293b').font('Helvetica').fontSize(8);
      }
      doc.text(cell ?? '—', x + 4, y + 6, { width: widths[i] - 8, lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    y += h;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row));
  doc.y = y + 8;
}
