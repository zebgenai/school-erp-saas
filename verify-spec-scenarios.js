/**
 * Verifies the exact fee-payment scenarios and bulk-archive scale from the acceptance spec.
 *
 * Usage: node verify-spec-scenarios.js [baseUrl]
 * Requires a running backend and the seeded school admin account.
 */
const BASE = process.argv[2] || 'http://localhost:3000/api';
const EMAIL = process.env.E2E_EMAIL || 'admin@iqra.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin@123';

/** Isolated period so repeated runs never collide with real invoices. */
const YEAR = 2039;

let token = '';
let pass = 0;
let fail = 0;

const ok = (n, x) => { pass++; console.log(`[PASS] ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x) => { fail++; console.log(`[FAIL] ${n}${x ? ` — ${x}` : ''}`); };
const info = (m) => console.log(`       ${m}`);
const section = (t) => console.log(`\n=== ${t} ===`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The API throttles at 10 requests/second, so calls are paced to stay under it. */
async function call(method, urlPath, body, raw) {
  await sleep(130);
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (raw) return { status: res.status, ok: res.ok, headers: res.headers, buffer: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, headers: res.headers, body: json };
}

function countZipEntries(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error('not a zip');
  return buf.readUInt16LE(eocd + 10);
}

/** Creates a fresh PKR 5,000 invoice in the isolated test period. */
async function makeInvoice(studentId, month) {
  const res = await call('POST', '/fees/invoices', { studentId, month, year: YEAR, amount: 5000 });
  if (!res.ok) throw new Error(`invoice create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

function check(name, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  same ? ok(name, JSON.stringify(actual)) : bad(name, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

function snapshot(inv) {
  return {
    status: inv.status,
    paid: inv.paidAmount,
    pending: inv.pendingAmount ?? inv.totalAmount - inv.paidAmount,
  };
}

async function main() {
  const login = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (!login.ok) { bad('login', login.status); process.exit(1); }
  token = login.body.accessToken;
  ok('login', `${EMAIL} as ${login.body.user?.role}`);

  const studs = await call('GET', '/students?limit=2');
  const students = studs.body?.data ?? [];
  if (students.length === 0) { bad('students available'); process.exit(1); }
  const student = students[0];
  info(`test student: ${student.fullName} (${student.admissionNo})`);

  // Free months in the isolated year, so the script is re-runnable.
  const existing = await call('GET', `/fees/invoices?year=${YEAR}&studentId=${student.id}&limit=200`);
  const used = new Set((existing.body?.data ?? []).map((i) => i.month));
  const freeMonths = [];
  for (let m = 1; m <= 12 && freeMonths.length < 3; m++) if (!used.has(m)) freeMonths.push(m);
  if (freeMonths.length < 3) { bad('free test months', `only ${freeMonths.length} left in ${YEAR}`); process.exit(1); }

  // ── Scenario: full payment ──
  section('Full payment — invoice 5,000 / pay 5,000');
  const invA = await makeInvoice(student.id, freeMonths[0]);
  check('new invoice starts unpaid', snapshot(invA), { status: 'UNPAID', paid: 0, pending: 5000 });
  const payA = await call('POST', '/fees/payments', { invoiceId: invA.id, amount: 5000, method: 'CASH' });
  payA.ok
    ? check('after paying 5,000', snapshot(payA.body), { status: 'PAID', paid: 5000, pending: 0 })
    : bad('after paying 5,000', `${payA.status} ${JSON.stringify(payA.body)}`);

  // ── Scenario: partial then remainder ──
  section('Partial payment — invoice 5,000 / pay 2,000 then 3,000');
  const invB = await makeInvoice(student.id, freeMonths[1]);
  const payB1 = await call('POST', '/fees/payments', { invoiceId: invB.id, amount: 2000, method: 'CASH' });
  payB1.ok
    ? check('after paying 2,000', snapshot(payB1.body), { status: 'PARTIAL', paid: 2000, pending: 3000 })
    : bad('after paying 2,000', `${payB1.status} ${JSON.stringify(payB1.body)}`);

  const payB2 = await call('POST', '/fees/payments', { invoiceId: invB.id, amount: 3000, method: 'BANK' });
  payB2.ok
    ? check('after paying remaining 3,000', snapshot(payB2.body), { status: 'PAID', paid: 5000, pending: 0 })
    : bad('after paying remaining 3,000', `${payB2.status} ${JSON.stringify(payB2.body)}`);

  const histB = await call('GET', `/fees/invoices/${invB.id}`);
  const paymentsB = histB.body?.payments ?? [];
  paymentsB.length === 2
    ? ok('payment history holds both instalments', paymentsB.map((p) => `${p.receiptNo}:${p.amount}`).join(', '))
    : bad('payment history holds both instalments', `${paymentsB.length} payment(s)`);

  // ── Scenario: invalid payments ──
  section('Invalid payments rejected — invoice 5,000');
  const invC = await makeInvoice(student.id, freeMonths[2]);
  const cases = [
    ['negative amount', -500],
    ['zero amount', 0],
    ['amount greater than remaining balance', 5001],
    ['fractional amount', 100.5],
  ];
  for (const [label, amount] of cases) {
    const r = await call('POST', '/fees/payments', { invoiceId: invC.id, amount, method: 'CASH' });
    r.status === 400
      ? ok(`${label} rejected`, JSON.stringify(r.body.message))
      : bad(`${label} rejected`, `status ${r.status} ${JSON.stringify(r.body)}`);
  }

  // Duplicate submission: two identical requests fired together, as a double-click would.
  await sleep(1200);
  const [d1, d2] = await Promise.all([
    call('POST', '/fees/payments', { invoiceId: invC.id, amount: 1000, method: 'CASH' }),
    call('POST', '/fees/payments', { invoiceId: invC.id, amount: 1000, method: 'CASH' }),
  ]);
  const accepted = [d1, d2].filter((r) => r.ok).length;
  accepted === 1
    ? ok('concurrent duplicate submissions apply once', `1 accepted, 1 rejected (${[d1, d2].find((r) => !r.ok)?.status})`)
    : bad('concurrent duplicate submissions apply once', `${accepted} accepted`);

  const afterDup = await call('GET', `/fees/invoices/${invC.id}`);
  check('balance after duplicate attempt', snapshot(afterDup.body), { status: 'PARTIAL', paid: 1000, pending: 4000 });

  const seqDup = await call('POST', '/fees/payments', { invoiceId: invC.id, amount: 1000, method: 'CASH' });
  seqDup.status === 400
    ? ok('immediate repeat of same payment rejected', JSON.stringify(seqDup.body.message))
    : bad('immediate repeat of same payment rejected', `status ${seqDup.status}`);

  // A genuinely different payment is still allowed.
  const different = await call('POST', '/fees/payments', { invoiceId: invC.id, amount: 4000, method: 'BANK' });
  different.ok
    ? check('a different payment still succeeds', snapshot(different.body), { status: 'PAID', paid: 5000, pending: 0 })
    : bad('a different payment still succeeds', `${different.status} ${JSON.stringify(different.body)}`);

  // ── Bulk archive at scale ──
  section('Bulk invoice archive at scale');
  const all = await call('GET', '/fees/invoices?limit=40');
  const ids = (all.body?.data ?? []).map((i) => i.id);
  if (ids.length < 2) {
    bad('archive scale test', 'not enough invoices');
  } else {
    const started = Date.now();
    const zip = await call('POST', '/pdf/fee-invoices/archive', { invoiceIds: ids }, true);
    const elapsed = Date.now() - started;
    if (!zip.ok) {
      bad('archive scale test', `${zip.status} ${zip.buffer.toString('utf8').slice(0, 200)}`);
    } else {
      const entries = countZipEntries(zip.buffer);
      entries === ids.length
        ? ok('archive holds one PDF per requested invoice', `${entries} entries`)
        : bad('archive holds one PDF per requested invoice', `${entries} vs ${ids.length}`);
      info(`${(zip.buffer.length / 1048576).toFixed(1)} MB in ${(elapsed / 1000).toFixed(1)}s — ${(zip.buffer.length / entries / 1024).toFixed(0)} KB per invoice`);
      info(`content-disposition: ${zip.headers.get('content-disposition')}`);
    }
  }

  // Unknown ids must not leak another school's data.
  const bogus = await call('POST', '/pdf/fee-invoices/archive', { invoiceIds: ['00000000-0000-4000-8000-000000000000'] }, true);
  bogus.status === 404
    ? ok('unknown invoice ids rejected', String(bogus.status))
    : bad('unknown invoice ids rejected', `status ${bogus.status}`);

  const malformed = await call('POST', '/pdf/fee-invoices/archive', { invoiceIds: ['not-a-uuid'] }, true);
  malformed.status === 400
    ? ok('malformed invoice ids rejected', String(malformed.status))
    : bad('malformed invoice ids rejected', `status ${malformed.status}`);

  // ── Unauthenticated access ──
  section('Authentication');
  const saved = token;
  token = '';
  const anon = await call('POST', '/pdf/fee-invoices/archive', { invoiceIds: ids.slice(0, 1) }, true);
  anon.status === 401 ? ok('archive requires authentication') : bad('archive requires authentication', `status ${anon.status}`);
  token = saved;

  section('Summary');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
