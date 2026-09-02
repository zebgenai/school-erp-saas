const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function admissionEmail(opts: {
  studentName: string;
  admissionNo: string;
  className: string;
  schoolName: string;
}) {
  return {
    subject: `Admission Confirmation — ${opts.studentName}`,
    body: `Dear Parent,\n\nWelcome to ${opts.schoolName}!\n\n${opts.studentName} has been successfully admitted to ${opts.className}.\nAdmission No: ${opts.admissionNo}\n\nWe look forward to a successful academic journey together.\n\nRegards,\n${opts.schoolName}`,
  };
}

export function feeInvoiceEmail(opts: {
  studentName: string;
  invoiceNo: string;
  amount: number;
  month: number;
  year: number;
  dueDate?: string;
  schoolName: string;
}) {
  const period = `${MONTHS[(opts.month ?? 1) - 1]} ${opts.year}`;
  return {
    subject: `Fee Invoice — ${period}`,
    body: `Dear Parent,\n\nA fee invoice has been generated for ${opts.studentName}.\n\nInvoice No: ${opts.invoiceNo}\nPeriod: ${period}\nAmount: PKR ${opts.amount.toLocaleString()}\n${opts.dueDate ? `Due Date: ${opts.dueDate}\n` : ''}\nPlease pay at your earliest convenience.\n\nRegards,\n${opts.schoolName}`,
  };
}

export function feeReceiptEmail(opts: {
  studentName: string;
  amount: number;
  receiptNo: string;
  month: number;
  year: number;
  schoolName: string;
}) {
  const period = `${MONTHS[(opts.month ?? 1) - 1]} ${opts.year}`;
  return {
    subject: `Fee Payment Receipt — ${opts.receiptNo}`,
    body: `Dear Parent,\n\nWe have received your fee payment.\n\nStudent: ${opts.studentName}\nReceipt No: ${opts.receiptNo}\nPeriod: ${period}\nAmount Paid: PKR ${opts.amount.toLocaleString()}\n\nThank you for your payment.\n\nRegards,\n${opts.schoolName}`,
  };
}

export function attendanceAlertEmail(opts: {
  studentName: string;
  date: string;
  schoolName: string;
}) {
  return {
    subject: `Attendance Alert — ${opts.studentName}`,
    body: `Dear Parent,\n\n${opts.studentName} was marked ABSENT on ${opts.date}.\n\nIf this is unexpected, please contact the school office.\n\nRegards,\n${opts.schoolName}`,
  };
}

export function resultPublishedEmail(opts: {
  studentName: string;
  examName: string;
  schoolName: string;
}) {
  return {
    subject: `Exam Results Published — ${opts.examName}`,
    body: `Dear Parent,\n\nExam results for ${opts.examName} have been published.\n\nStudent: ${opts.studentName}\n\nPlease log in to the parent portal to view detailed results.\n\nRegards,\n${opts.schoolName}`,
  };
}

export function feeReminderSms(opts: {
  studentName: string;
  amount: number;
  dueDate?: string;
}) {
  const due = opts.dueDate ? ` Due: ${opts.dueDate}.` : '';
  return `Fee Reminder: PKR ${opts.amount.toLocaleString()} pending for ${opts.studentName}.${due} Please pay to avoid late charges.`;
}

export function attendanceAlertSms(opts: { studentName: string; date: string }) {
  return `Attendance Alert: ${opts.studentName} was marked ABSENT on ${opts.date}. Contact school if unexpected.`;
}

export function resultAlertSms(opts: { studentName: string; examName: string }) {
  return `Results Published: ${opts.examName} results for ${opts.studentName} are now available. Check the parent portal.`;
}

export function feeReminderWhatsApp(opts: {
  studentName: string;
  amount: number;
  dueDate?: string;
}) {
  return feeReminderSms(opts);
}

export function attendanceAlertWhatsApp(opts: { studentName: string; date: string }) {
  return attendanceAlertSms(opts);
}

export function resultAlertWhatsApp(opts: { studentName: string; examName: string }) {
  return resultAlertSms(opts);
}
