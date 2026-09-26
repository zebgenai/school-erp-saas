import { IdCardTemplate } from '@prisma/client';
import { resolveUploadDiskPath } from '../../common/utils/upload-path';
import { TeacherIdCardView } from '../../id-cards/teacher-card-payload';
import { ID_CARD_HEIGHT, ID_CARD_WIDTH } from './id-card.template';

type Palette = {
  header: string;
  accent: string;
  text: string;
  muted: string;
  bg: string;
  back: string;
  backText: string;
  badge: string;
};

/** Staff-oriented palette — teal/slate, distinct from student navy/gold CLASSIC. */
function palette(template: IdCardTemplate, themeColor?: string | null): Palette {
  const theme =
    themeColor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(themeColor.trim())
      ? themeColor.trim()
      : '#0f766e';

  switch (template) {
    case IdCardTemplate.MODERN:
      return {
        header: theme,
        accent: theme,
        text: '#0f172a',
        muted: '#64748b',
        bg: '#ffffff',
        back: theme,
        backText: '#ffffff',
        badge: theme,
      };
    case IdCardTemplate.PREMIUM:
      return {
        header: '#0f172a',
        accent: '#0d9488',
        text: '#0f172a',
        muted: '#64748b',
        bg: '#f0fdfa',
        back: '#0f172a',
        backText: '#ccfbf1',
        badge: '#0d9488',
      };
    case IdCardTemplate.MINIMAL:
      return {
        header: '#ffffff',
        accent: '#14b8a6',
        text: '#334155',
        muted: '#94a3b8',
        bg: '#ffffff',
        back: '#f8fafc',
        backText: '#334155',
        badge: '#0f766e',
      };
    default:
      return {
        header: '#115e59',
        accent: '#2dd4bf',
        text: '#134e4a',
        muted: '#5b7c7a',
        bg: '#ffffff',
        back: '#115e59',
        backText: '#ffffff',
        badge: '#0f766e',
      };
  }
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

export function renderTeacherIdCardSheet(
  doc: PDFKit.PDFDocument,
  cards: Array<TeacherIdCardView & { qrPng?: Buffer; photoPath?: string | null }>,
) {
  const marginX = 36;
  const marginY = 36;
  const gapX = 18;
  const gapY = 16;
  const rows = 4;
  let index = 0;

  while (index < cards.length) {
    if (index > 0) doc.addPage();
    for (let row = 0; row < rows && index < cards.length; row++) {
      const card = cards[index];
      const y = marginY + row * (ID_CARD_HEIGHT + gapY);
      const frontX = marginX;
      const backX = marginX + ID_CARD_WIDTH + gapX;
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
  const colors = palette(card.template, card.school.themeColor);
  const w = ID_CARD_WIDTH;
  const h = ID_CARD_HEIGHT;

  doc.save();
  roundRect(doc, x, y, w, h, 8);
  doc.fillColor(colors.bg).fill();
  doc.restore();

  const headerH = card.template === IdCardTemplate.MINIMAL ? 28 : 36;
  doc.save();
  doc.roundedRect(x, y, w, headerH + 8, 8).fill(colors.header);
  doc.rect(x, y + headerH, w, 8).fill(colors.header);
  if (card.template !== IdCardTemplate.MINIMAL) {
    doc.rect(x, y + headerH + 6, w, 3).fill(colors.accent);
  }
  doc.restore();

  const logoPath = resolveUploadDiskPath(card.school.logoUrl);
  if (logoPath) {
    try {
      doc.image(logoPath, x + 8, y + 6, { width: 22, height: 22, fit: [22, 22] });
    } catch {
      /* ignore */
    }
  }

  const titleColor = card.template === IdCardTemplate.MINIMAL ? colors.text : '#ffffff';
  doc
    .fillColor(titleColor)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(card.school.name, x + (logoPath ? 34 : 10), y + 8, { width: w - 44, height: 20 });

  // STAFF badge — visually distinct from student cards
  doc.save();
  doc.roundedRect(x + w - 48, y + 8, 38, 12, 3).fill(colors.badge);
  doc
    .fillColor('#ffffff')
    .font('Helvetica-Bold')
    .fontSize(6)
    .text('STAFF', x + w - 48, y + 10.5, { width: 38, align: 'center' });
  doc.restore();

  const photoSize = 58;
  const photoX = x + 10;
  const photoY = y + headerH + 14;
  drawPhoto(
    doc,
    card.photoPath ?? resolveUploadDiskPath(card.teacher.photoUrl),
    photoX,
    photoY,
    photoSize,
  );

  const textX = photoX + photoSize + 10;
  const textW = w - photoSize - 28;
  let textY = photoY;
  doc
    .fillColor(colors.text)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(card.teacher.fullName, textX, textY, { width: textW });
  textY = doc.y + 2;
  doc
    .fillColor(colors.muted)
    .font('Helvetica')
    .fontSize(7)
    .text(card.teacher.designation?.trim() || 'Teacher', textX, textY, { width: textW });
  textY = doc.y + 3;
  doc
    .fillColor(colors.text)
    .font('Helvetica')
    .fontSize(7.5)
    .text(`Emp. ID  ${card.teacher.employeeNo?.trim() || '—'}`, textX, textY, { width: textW });

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
  const colors = palette(card.template, card.school.themeColor);
  const w = ID_CARD_WIDTH;
  const h = ID_CARD_HEIGHT;

  doc.save();
  roundRect(doc, x, y, w, h, 8);
  doc.fillColor(colors.back).fill();
  doc.restore();

  const qrSize = 78;
  const qrX = x + (w - qrSize) / 2;
  const qrY = y + 10;
  doc.save();
  doc.roundedRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, 6).fill('#ffffff');
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
    .text('Teacher Attendance QR', x + 8, qrY + qrSize + 6, { width: w - 16, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(6.5)
    .text(`Ref  ${card.card.reference}`, x + 8, qrY + qrSize + 16, {
      width: w - 16,
      align: 'center',
    });

  const contact = [card.school.phone, card.school.email, card.school.domain]
    .filter(Boolean)
    .join('  ·  ');
  const infoY = y + h - 22;
  if (card.school.address) {
    doc
      .fontSize(5.5)
      .fillColor(colors.backText)
      .text(card.school.address, x + 8, infoY - 8, {
        width: w - 16,
        align: 'center',
        lineBreak: false,
      });
  }
  if (contact) {
    doc
      .fontSize(5.5)
      .fillColor(colors.backText)
      .text(contact, x + 8, infoY, { width: w - 16, align: 'center', lineBreak: false });
  }

  doc.save();
  doc.roundedRect(x, y, w, h, 8).lineWidth(1).strokeColor(colors.accent).stroke();
  doc.restore();
}
