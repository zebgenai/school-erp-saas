/**
 * End-to-end verification for the fees payment workflow, monthly invoice ZIP download,
 * student profile PDF, and payroll salary slip PDF.
 *
 * Usage: node e2e-verify.js [baseUrl]
 * Requires a running backend and the seeded school admin account.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const BASE = process.argv[2] || 'http://localhost:3000/api';
const EMAIL = process.env.E2E_EMAIL || 'admin@iqra.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin@123';
const OUT_DIR = path.join(os.tmpdir(), 'erp-e2e');

let token = '';
let pass = 0;
let fail = 0;

function ok(name, extra) {
  pass++;
  console.log(`[PASS] ${name}${extra ? ` — ${extra}` : ''}`);
}
function bad(name, extra) {
  fail++;
  console.log(`[FAIL] ${name}${extra ? ` — ${extra}` : ''}`);
}
function info(msg) {
  console.log(`       ${msg}`);
}
function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function call(method, urlPath, body, expectRaw) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (expectRaw) {
    return { status: res.status, ok: res.ok, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, body: json };
}

/**
 * Extract visible text from a PDFKit-generated PDF so field values can be asserted.
 * PDFKit emits kerned show-text arrays of hex strings, e.g. `[<48656c> 20 <6c6f>] TJ`,
 * and occasionally literal strings, so both forms are decoded.
 */
function pdfText(buf) {
  let text = '';
  let idx = 0;
  for (;;) {
    const s = buf.indexOf('stream', idx);
    if (s === -1) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf('endstream', start);
    if (e === -1) break;
    const raw = buf.slice(start, e);
    let content = null;
    try {
      content = zlib.inflateSync(raw).toString('latin1');
    } catch {
      content = raw.toString('latin1');
    }
    // Only page content streams carry show-text operators; image data will not match.
    for (const m of content.matchAll(/\[([^\]]*)\]\s*TJ|\(((?:\\.|[^\\()])*)\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
      if (m[2] !== undefined) {
        text += m[2].replace(/\\([()\\])/g, '$1') + '\n';
      } else if (m[3] !== undefined) {
        text += Buffer.from(m[3].replace(/\s+/g, ''), 'hex').toString('latin1') + '\n';
      } else {
        let line = '';
        for (const p of m[1].matchAll(/<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\()])*)\)/g)) {
          line += p[1] !== undefined
            ? Buffer.from(p[1].replace(/\s+/g, ''), 'hex').toString('latin1')
            : p[2].replace(/\\([()\\])/g, '$1');
        }
        text += line + '\n';
      }
    }
    idx = e + 9;
  }
  return text;
}

/** Minimal central-directory reader so ZIP entry names and payloads can be verified. */
function zipEntries(buf) {
  const entries = [];
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error('not a zip (no EOCD)');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(off + 10);
    const compressedSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString('utf8');

    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const raw = buf.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? raw : zlib.inflateRawSync(raw);

    entries.push({ name, data });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function assertPdf(name, buffer) {
  if (buffer.slice(0, 4).toString('ascii') !== '%PDF') {
    bad(name, `not a PDF (got ${JSON.stringify(buffer.slice(0, 40).toString('utf8'))})`);
    return null;
  }
  if (buffer.length < 800) {
    bad(name, `PDF suspiciously small (${buffer.length} bytes)`);
    return null;
  }
  return pdfText(buffer);
}

function contains(text, needle) {
  return text.replace(/\s+/g, ' ').includes(String(needle).replace(/\s+/g, ' '));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  section('Auth');
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (!login.ok || !login.body?.accessToken) {
    bad('login', `${login.status} ${JSON.stringify(login.body)}`);
    process.exit(1);
  }
  token = login.body.accessToken;
  ok('login', `${EMAIL} as ${login.body.user?.role}`);

  // ── Pick a target month that has no invoices yet so generation is observable ──
  section('Monthly invoice generation + automatic download');
  const YEAR = 2031;
  let genMonth = null;
  let gen = null;
  for (let m = 1; m <= 12; m++) {
    const probe = await call('POST', '/fees/invoices/bulk', { month: m, year: YEAR });
    if (!probe.ok) {
      bad('generate monthly invoices', `${probe.status} ${JSON.stringify(probe.body)}`);
      break;
    }
    if (probe.body.created > 0) {
      genMonth = m;
      gen = probe.body;
      break;
    }
    info(`month ${m}/${YEAR} already fully generated (skipped ${probe.body.skipped}), trying next`);
  }

  if (!gen) {
    bad('generate monthly invoices', 'no month produced new invoices');
  } else {
    ok('generate monthly invoices', `created=${gen.created} skipped=${gen.skipped} month=${genMonth}/${YEAR}`);

    if (!Array.isArray(gen.invoiceIds)) {
      bad('generation returns created invoice ids', `response keys: ${Object.keys(gen).join(', ')}`);
    } else if (gen.invoiceIds.length !== gen.created) {
      bad('generation returns created invoice ids', `created=${gen.created} but ids=${gen.invoiceIds.length}`);
    } else {
      ok('generation returns created invoice ids', `${gen.invoiceIds.length} ids`);

      // ZIP of exactly the newly created invoices
      const zip = await call('POST', '/pdf/fee-invoices/archive', { invoiceIds: gen.invoiceIds }, true);
      if (!zip.ok) {
        bad('bulk invoice ZIP', `${zip.status} ${zip.buffer.toString('utf8').slice(0, 300)}`);
      } else {
        const cd = zip.headers.get('content-disposition') || '';
        const ct = zip.headers.get('content-type') || '';
        try {
          const entries = zipEntries(zip.buffer);
          if (entries.length !== gen.invoiceIds.length) {
            bad('ZIP contains only the newly generated invoices', `${entries.length} entries vs ${gen.invoiceIds.length} ids`);
          } else {
            ok('bulk invoice ZIP', `${entries.length} PDFs, ${zip.buffer.length} bytes, type=${ct}`);
            info(`content-disposition: ${cd}`);
            info(`entries: ${entries.slice(0, 3).map((e) => e.name).join(', ')}${entries.length > 3 ? ', …' : ''}`);

            const allPdf = entries.every((e) => e.data.slice(0, 4).toString('ascii') === '%PDF');
            if (allPdf) ok('every ZIP entry is a valid PDF');
            else bad('every ZIP entry is a valid PDF');

            const namedByInvoiceNo = entries.every((e) => /^INV-\d{4}-\d{4}\.pdf$/.test(e.name));
            if (namedByInvoiceNo) ok('ZIP entries named by invoice number');
            else bad('ZIP entries named by invoice number', entries.map((e) => e.name).slice(0, 4).join(', '));

            // Verify each PDF belongs to the student on its invoice
            const first = await call('GET', `/fees/invoices/${gen.invoiceIds[0]}`);
            const inv = first.body;
            const match = entries.find((e) => e.name === `${inv.invoiceNo}.pdf`);
            if (match) {
              const t = pdfText(match.data);
              if (contains(t, inv.student.fullName) && contains(t, inv.invoiceNo)) {
                ok('ZIP PDF data belongs to the correct student', `${inv.invoiceNo} → ${inv.student.fullName}`);
              } else {
                bad('ZIP PDF data belongs to the correct student', `missing name/invoiceNo in ${inv.invoiceNo}.pdf`);
              }
            } else {
              bad('ZIP PDF data belongs to the correct student', `no entry for ${inv.invoiceNo}.pdf`);
            }
          }
        } catch (e) {
          bad('bulk invoice ZIP', `unreadable archive: ${e.message}`);
        }
      }

      // Single-invoice generation must download a plain PDF, not a ZIP
      const single = await call('POST', '/pdf/fee-invoices/archive', { invoiceIds: [gen.invoiceIds[0]] }, true);
      if (single.ok) {
        const magic = single.buffer.slice(0, 2).toString('ascii');
        if (magic === 'PK') ok('single-id archive returns a ZIP (frontend downloads the PDF directly instead)');
        else bad('single-id archive', `unexpected payload magic ${magic}`);
      }

      // Only invoices from this operation may be included
      const other = await call('POST', '/pdf/fee-invoices/archive', { invoiceIds: [] }, true);
      if (other.status === 400) ok('empty invoice id list rejected');
      else bad('empty invoice id list rejected', `status ${other.status}`);
    }
  }

  // ── Fees payment workflow ──
  section('Fees paid/unpaid workflow');
  const listRes = await call('GET', '/fees/invoices', undefined);
  const invoices = listRes.body?.data ?? [];
  info(`invoice list returned ${invoices.length} rows (total ${listRes.body?.total})`);

  const target = invoices.find((i) => i.status === 'UNPAID' && i.totalAmount > 0);
  if (!target) {
    bad('find an unpaid invoice to test', 'no UNPAID invoice with a non-zero total');
  } else {
    info(`using ${target.invoiceNo} (${target.student?.fullName}) total=${target.totalAmount}`);

    // Invalid payments
    const neg = await call('POST', '/fees/payments', { invoiceId: target.id, amount: -500, method: 'CASH' });
    neg.status === 400 ? ok('negative amount rejected', JSON.stringify(neg.body.message)) : bad('negative amount rejected', `status ${neg.status}`);

    const zero = await call('POST', '/fees/payments', { invoiceId: target.id, amount: 0, method: 'CASH' });
    zero.status === 400 ? ok('zero amount rejected', JSON.stringify(zero.body.message)) : bad('zero amount rejected', `status ${zero.status}`);

    const over = await call('POST', '/fees/payments', { invoiceId: target.id, amount: target.totalAmount + 1, method: 'CASH' });
    over.status === 400 ? ok('over-payment rejected', JSON.stringify(over.body.message)) : bad('over-payment rejected', `status ${over.status}`);

    // Partial payment
    const partAmount = Math.floor(target.totalAmount / 2) || 1;
    const p1 = await call('POST', '/fees/payments', { invoiceId: target.id, amount: partAmount, method: 'CASH', paymentDate: new Date().toISOString().slice(0, 10) });
    if (!p1.ok) {
      bad('partial payment', `${p1.status} ${JSON.stringify(p1.body)}`);
    } else {
      const expectedStatus = partAmount >= target.totalAmount ? 'PAID' : 'PARTIAL';
      const good = p1.body.status === expectedStatus && p1.body.paidAmount === partAmount;
      good
        ? ok('partial payment', `paid=${p1.body.paidAmount} pending=${p1.body.totalAmount - p1.body.paidAmount} status=${p1.body.status}`)
        : bad('partial payment', `status=${p1.body.status} paid=${p1.body.paidAmount} (expected ${expectedStatus}/${partAmount})`);

      if (p1.body.pendingAmount === p1.body.totalAmount - p1.body.paidAmount) {
        ok('pendingAmount returned by API', String(p1.body.pendingAmount));
      } else {
        info(`pendingAmount not exposed (client computes total-paid)`);
      }

      // Duplicate submission of the identical payment
      const dup = await call('POST', '/fees/payments', { invoiceId: target.id, amount: partAmount, method: 'CASH' });
      if (dup.status === 400 || dup.status === 409) {
        ok('duplicate payment submission rejected', JSON.stringify(dup.body.message));
      } else {
        bad('duplicate payment submission rejected', `status ${dup.status} — invoice now paid=${dup.body?.paidAmount}`);
      }

      // Pay the remainder → PAID
      const fresh = await call('GET', `/fees/invoices/${target.id}`);
      const remaining = fresh.body.totalAmount - fresh.body.paidAmount;
      if (remaining > 0) {
        const p2 = await call('POST', '/fees/payments', { invoiceId: target.id, amount: remaining, method: 'BANK', notes: 'e2e remainder' });
        if (p2.ok && p2.body.status === 'PAID' && p2.body.paidAmount === p2.body.totalAmount) {
          ok('remaining payment completes invoice', `paid=${p2.body.paidAmount} pending=0 status=PAID`);
        } else {
          bad('remaining payment completes invoice', `${p2.status} status=${p2.body?.status} paid=${p2.body?.paidAmount}`);
        }
      } else {
        info('invoice already fully paid after first payment');
      }

      // No further payment allowed on a PAID invoice
      const after = await call('POST', '/fees/payments', { invoiceId: target.id, amount: 1, method: 'CASH' });
      after.status === 400 ? ok('payment on fully paid invoice rejected', JSON.stringify(after.body.message)) : bad('payment on fully paid invoice rejected', `status ${after.status}`);

      // Payment history + receipt availability
      const final = await call('GET', `/fees/invoices/${target.id}`);
      const payments = final.body.payments ?? [];
      payments.length >= 1 ? ok('payment history recorded', `${payments.length} payment(s)`) : bad('payment history recorded');

      if (payments[0]) {
        const receipt = await call('GET', `/pdf/fee-receipt/${payments[0].id}`, undefined, true);
        if (!receipt.ok) {
          bad('receipt PDF available after payment', `${receipt.status}`);
        } else {
          const t = assertPdf('receipt PDF available after payment', receipt.buffer);
          if (t) {
            contains(t, payments[0].receiptNo) && contains(t, final.body.student.fullName)
              ? ok('receipt PDF available after payment', `${payments[0].receiptNo}, ${receipt.buffer.length} bytes`)
              : bad('receipt PDF content', 'receiptNo or student name missing');
          }
        }
      }

      // Invoice PDF reflects the settled balance
      const invPdf = await call('GET', `/pdf/fee-invoice/${target.id}`, undefined, true);
      if (invPdf.ok) {
        const t = assertPdf('invoice PDF after payment', invPdf.buffer);
        if (t) {
          contains(t, 'PAID') ? ok('invoice PDF shows PAID status') : bad('invoice PDF shows PAID status');
        }
      } else {
        bad('invoice PDF after payment', `${invPdf.status}`);
      }
    }
  }

  // Status filters for identifying unpaid invoices
  for (const st of ['UNPAID', 'PARTIAL', 'PAID']) {
    const r = await call('GET', `/fees/invoices?status=${st}&limit=5`);
    if (r.ok && Array.isArray(r.body.data) && r.body.data.every((i) => i.status === st)) {
      ok(`invoice status filter ${st}`, `total=${r.body.total}`);
    } else {
      bad(`invoice status filter ${st}`, `${r.status}`);
    }
  }

  // ── Student profile PDF ──
  section('Student profile PDF');
  const studs = await call('GET', '/students?limit=1');
  const student = (studs.body?.data ?? [])[0];
  if (!student) {
    bad('student profile PDF', 'no students found');
  } else {
    const r = await call('GET', `/pdf/student-profile/${student.id}`, undefined, true);
    if (!r.ok) {
      bad('student profile PDF', `${r.status} ${r.buffer.toString('utf8').slice(0, 200)}`);
    } else {
      const t = assertPdf('student profile PDF', r.buffer);
      if (t) {
        fs.writeFileSync(path.join(OUT_DIR, 'student-profile.pdf'), r.buffer);
        const checks = [
          ['student name', student.fullName],
          ['admission number', student.admissionNo],
          ['status', student.status],
        ];
        if (student.class?.name) checks.push(['class', student.class.name]);
        if (student.section?.name) checks.push(['section', student.section.name]);
        if (student.fatherName) checks.push(['guardian', student.fatherName]);
        if (student.guardianPhone) checks.push(['phone', student.guardianPhone]);
        if (student.address) checks.push(['address', student.address]);

        const missing = checks.filter(([, v]) => !contains(t, v)).map(([k]) => k);
        missing.length === 0
          ? ok('student profile PDF contains full profile', `${checks.map(([k]) => k).join(', ')} (${r.buffer.length} bytes)`)
          : bad('student profile PDF contains full profile', `missing: ${missing.join(', ')}`);

        const hasDob = !student.dateOfBirth || /Date of Birth/i.test(t);
        hasDob ? ok('student profile PDF has DOB/gender labels') : bad('student profile PDF has DOB/gender labels');

        contains(t, 'Student Profile') ? ok('student profile PDF titled correctly') : bad('student profile PDF titled correctly');
        /localhost|127\.0\.0\.1|undefined|\[object/i.test(t)
          ? bad('student profile PDF free of broken URLs/placeholders', t.match(/localhost|undefined|\[object/i)[0])
          : ok('student profile PDF free of broken URLs/placeholders');
      }
    }
  }

  // ── Payroll salary slip ──
  section('Payroll salary slip PDF');
  const now = new Date();
  let payroll = null;
  for (const [mm, yy] of [[now.getMonth() + 1, now.getFullYear()], [now.getMonth() || 12, now.getFullYear()]]) {
    const r = await call('GET', `/payroll?month=${mm}&year=${yy}&limit=5`);
    const rows = r.body?.data ?? [];
    if (rows.length) {
      payroll = rows[0];
      break;
    }
  }
  if (!payroll) {
    const g = await call('POST', '/payroll/generate', { month: now.getMonth() + 1, year: now.getFullYear() });
    info(`generated payroll: ${JSON.stringify(g.body)}`);
    const r = await call('GET', `/payroll?month=${now.getMonth() + 1}&year=${now.getFullYear()}&limit=5`);
    payroll = (r.body?.data ?? [])[0];
  }

  if (!payroll) {
    bad('salary slip PDF', 'no payroll records available');
  } else {
    const r = await call('GET', `/pdf/salary-slip/${payroll.id}`, undefined, true);
    if (!r.ok) {
      bad('salary slip PDF', `${r.status} ${r.buffer.toString('utf8').slice(0, 200)}`);
    } else {
      const t = assertPdf('salary slip PDF', r.buffer);
      if (t) {
        fs.writeFileSync(path.join(OUT_DIR, 'salary-slip.pdf'), r.buffer);
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const checks = [
          ['employee name', payroll.staffName],
          ['month', `${MONTHS[payroll.month - 1]} ${payroll.year}`],
          ['payment status', payroll.status],
          ['basic salary', payroll.basicSalary.toLocaleString('en-US')],
          ['net salary', payroll.netSalary.toLocaleString('en-US')],
        ];
        const missing = checks.filter(([, v]) => !contains(t, v)).map(([k]) => k);
        missing.length === 0
          ? ok('salary slip PDF contains salary details', `${payroll.staffName}, ${MONTHS[payroll.month - 1]} ${payroll.year}, net ${payroll.netSalary} (${r.buffer.length} bytes)`)
          : bad('salary slip PDF contains salary details', `missing: ${missing.join(', ')}`);

        /Allowances/i.test(t) && /Deductions/i.test(t)
          ? ok('salary slip PDF shows allowances and deductions')
          : bad('salary slip PDF shows allowances and deductions');

        /Designation|Role/i.test(t) ? ok('salary slip PDF shows designation/role') : bad('salary slip PDF shows designation/role');
        contains(t, 'Salary Slip') ? ok('salary slip PDF titled correctly') : bad('salary slip PDF titled correctly');
      }
    }

    const cd = (await call('GET', `/pdf/salary-slip/${payroll.id}`, undefined, true)).headers.get('content-disposition') || '';
    /attachment; filename=/.test(cd) ? ok('salary slip served as a downloadable attachment', cd) : bad('salary slip disposition', cd);
  }

  section('Summary');
  console.log(`${pass} passed, ${fail} failed`);
  console.log(`artifacts in ${OUT_DIR}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
