import { IdCardTemplate } from '@prisma/client';
import { resolveUploadDiskPath } from '../../common/utils/upload-path';
import { TeacherIdCardView } from '../../id-cards/teacher-card-payload';
import {
  DEFAULT_TEACHER_ID_CARD_COLORS,
  teacherCardPalette,
  type TeacherIdCardColors,
} from '../../id-cards/teacher-id-card-colors';

const MM = 2.83465;

/** Portrait CR80 — independent of student landscape ID_CARD_WIDTH/HEIGHT. */
export const TEACHER_ID_CARD_WIDTH = 54 * MM;
export const TEACHER_ID_CARD_HEIGHT = 85.6 * MM;

function resolveColors(card: TeacherIdCardView) {
  const colors: TeacherIdCardColors =
    card.school.teacherCardColors ?? DEFAULT_TEACHER_ID_CARD_COLORS;
  return teacherCardPalette(card.template, colors);
}

function roundRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  doc.roundedRect(x, y, w, h, r);
}

function drawPhoto(
  doc: PDFKit.PDFDocument,
  photoPath: string | null,
  x: number,
  y: number,
  size: number,
) {
  if (photoPath) {
    try {
      doc.save();
      doc.roundedRect(x, y, size, size, 6).clip();
      doc.image(photoPath, x, y, { width: size, height: size, fit: [size, size] });
      doc.restore();
      doc.lineWidth(0.8).strokeColor('#99f6e4').roundedRect(x, y, size, size, 6).stroke();
      return;
    } catch {
      /* fall through */
    }
  }
  doc.save();
  doc.roundedRect(x, y, size, size, 6).fillAndStroke('#ccfbf1', '#99f6e4');
  doc
    .fillColor('#5eead4')
    .font('Helvetica')
    .fontSize(7)
    .text('NO PHOTO', x, y + size / 2 - 4, { width: size, align: 'center' });
  doc.restore();
}

/**
 * Pack portrait teacher cards on A4 portrait pages.
 * Each row: front | back of one card. ~3 cards per page.
 */
export function renderTeacherIdCardSheet(
  doc: PDFKit.PDFDocument,
  cards: Array<TeacherIdCardView & { qrPng?: Buffer; photoPath?: string | null }>,
) {
  const marginX = 40;
  const marginY = 36;
  const gapX = 20;
  const gapY = 18;
  const rows = 3;
  let index = 0;

  while (index < cards.length) {
    if (index > 0) doc.addPage();
    for (let row = 0; row < rows && index < cards.length; row++) {
      const card = cards[index];
      const y = marginY + row * (TEACHER_ID_CARD_HEIGHT + gapY);
      const frontX = marginX;
      const backX = marginX + TEACHER_ID_CARD_WIDTH + gapX;
      drawTeacherFront(doc, card, frontX, y);
      drawTeacherBack(doc, card, backX, y);
      index += 1;
    }
  }
}

function drawTeacherFront(
  doc: PDFKit.PDFDocument,
  card: TeacherIdCardView & { photoPath?: string | null },
  x: number,
  y: number,
) {
  const colors = resolveColors(card);
  const w = TEACHER_ID_CARD_WIDTH;
  const h = TEACHER_ID_CARD_HEIGHT;

  doc.save();
  roundRect(doc, x, y, w, h, 8);
  doc.fillColor(colors.bg).fill();
  doc.restore();

  // Header band
  const headerH = card.template === IdCardTemplate.MINIMAL ? 36 : 44;
  doc.save();
  doc.roundedRect(x, y, w, headerH + 10, 8).fill(colors.header);
  doc.rect(x, y + headerH, w, 10).fill(colors.header);
  if (card.template !== IdCardTemplate.MINIMAL) {
    doc.rect(x, y + headerH + 7, w, 3).fill(colors.accent);
  }
  doc.restore();

  const logoPath = resolveUploadDiskPath(card.school.logoUrl);
  if (logoPath) {
    try {
      doc.image(logoPath, x + (w - 28) / 2, y + 6, { width: 28, height: 22, fit: [28, 22] });
    } catch {
      /* ignore */
    }
  }

  const titleColor = card.template === IdCardTemplate.MINIMAL ? colors.text : '#ffffff';
  const titleY = logoPath ? y + 30 : y + 10;
  doc
    .fillColor(titleColor)
    .font('Helvetica-Bold')
    .fontSize(7.5)
    .text(card.school.name, x + 8, titleY, { width: w - 16, align: 'center', height: 16 });

  // STAFF badge
  doc.save();
  doc.roundedRect(x + (w - 42) / 2, y + headerH + 14, 42, 12, 3).fill(colors.badge);
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(6)
    .text('STAFF', x + (w - 42) / 2, y + headerH + 16.5, { width: 42, align: 'center' });
  doc.restore();

  // Centered photo
  const photoSize = 72;
  const photoX = x + (w - photoSize) / 2;
  const photoY = y + headerH + 32;
  drawPhoto(
    doc,
    card.photoPath ?? resolveUploadDiskPath(card.teacher.photoUrl),
    photoX,
    photoY,
    photoSize,
  );

  // Name / designation / emp id centered below photo
  let textY = photoY + photoSize + 10;
  doc
    .fillColor(colors.text)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(card.teacher.fullName, x + 8, textY, { width: w - 16, align: 'center' });
  textY = doc.y + 3;
  doc
    .fillColor(colors.muted)
    .font('Helvetica')
    .fontSize(7.5)
    .text(card.teacher.designation?.trim() || 'Teacher', x + 8, textY, {
      width: w - 16,
      align: 'center',
    });
  textY = doc.y + 5;
  doc
    .fillColor(colors.text)
    .font('Helvetica')
    .fontSize(7.5)
    .text(`Emp. ID  ${card.teacher.employeeNo?.trim() || '—'}`, x + 8, textY, {
      width: w - 16,
      align: 'center',
    });

  // Bottom accent bar
  doc.save();
  doc.rect(x, y + h - 6, w, 6).fill(colors.accent);
  doc.restore();

  doc.save();
  doc.roundedRect(x, y, w, h, 8).lineWidth(1).strokeColor(colors.accent).stroke();
  doc.restore();
}

function drawTeacherBack(
  doc: PDFKit.PDFDocument,
  card: TeacherIdCardView & { qrPng?: Buffer },
  x: number,
  y: number,
) {
  const colors = resolveColors(card);
  const w = TEACHER_ID_CARD_WIDTH;
  const h = TEACHER_ID_CARD_HEIGHT;

  doc.save();
  roundRect(doc, x, y, w, h, 8);
  doc.fillColor(colors.back).fill();
  doc.restore();

  // Top accent
  doc.save();
  doc.rect(x, y, w, 6).fill(colors.accent);
  doc.restore();

  const qrSize = 96;
  const qrX = x + (w - qrSize) / 2;
  const qrY = y + 28;
  doc.save();
  doc.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 6).fill('#ffffff');
  doc.restore();
  if (card.qrPng) {
    try {
      doc.image(card.qrPng, qrX, qrY, { width: qrSize, height: qrSize });
    } catch {
      /* ignore */
    }
  }

  doc
    .fillColor(colors.backText)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('Teacher Attendance QR', x + 8, qrY + qrSize + 10, {
      width: w - 16,
      align: 'center',
    });
  doc
    .font('Helvetica')
    .fontSize(6.5)
    .text(`Ref  ${card.card.reference}`, x + 8, qrY + qrSize + 22, {
      width: w - 16,
      align: 'center',
    });

  const contact = [card.school.phone, card.school.email, card.school.domain]
    .filter(Boolean)
    .join('  ·  ');
  const infoY = y + h - 28;
  if (card.school.address) {
    doc
      .fontSize(5.5)
      .fillColor(colors.backText)
      .text(card.school.address, x + 8, infoY - 10, {
        width: w - 16,
        align: 'center',
        height: 12,
      });
  }
  if (contact) {
    doc
      .fontSize(5.5)
      .fillColor(colors.backText)
      .text(contact, x + 8, infoY + 2, { width: w - 16, align: 'center', lineBreak: false });
  }

  doc.save();
  doc.roundedRect(x, y, w, h, 8).lineWidth(1).strokeColor(colors.accent).stroke();
  doc.restore();
}
