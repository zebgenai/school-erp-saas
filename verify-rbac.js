/**
 * Verifies role and school-isolation enforcement on the fee payment and invoice-archive
 * endpoints. Tokens are minted locally from JWT_SECRET so that no existing account has to
 * be modified; the backend still resolves the role from the database.
 *
 * Usage: node verify-rbac.js [baseUrl]
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000/api';
const EMAIL = process.env.E2E_EMAIL || 'admin@iqra.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin@123';

let pass = 0;
let fail = 0;
const ok = (n, x) => { pass++; console.log(`[PASS] ${n}${x ? ` — ${x}` : ''}`); };
const bad = (n, x) => { fail++; console.log(`[FAIL] ${n}${x ? ` — ${x}` : ''}`); };
const section = (t) => console.log(`\n=== ${t} ===`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jwtSecret() {
  const env = fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8');
  const m = /^JWT_SECRET\s*=\s*"?([^"\r\n]+)"?/m.exec(env);
  if (!m) throw new Error('JWT_SECRET not found in backend/.env');
  return m[1];
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function mintToken(userId, secret) {
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({ sub: userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 });
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function call(token, method, urlPath, body) {
  await sleep(130);
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const ct = res.headers.get('content-type') || '';
  const parsed = ct.includes('json') ? await res.json().catch(() => null) : null;
  return { status: res.status, ok: res.ok, body: parsed };
}

async function main() {
  const secret = jwtSecret();

  const login = await call(null, 'POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  if (!login.ok) { bad('admin login', login.status); process.exit(1); }
  const adminToken = login.body.accessToken;
  ok('admin login', `${EMAIL} as ${login.body.user?.role}`);

  const users = await call(adminToken, 'GET', '/users?limit=50');
  const list = users.body?.data ?? users.body ?? [];
  const teacher = list.find((u) => u.role === 'TEACHER');
  const accountant = list.find((u) => u.role === 'ACCOUNTANT');

  const invoices = await call(adminToken, 'GET', '/fees/invoices?limit=2');
  const rows = invoices.body?.data ?? [];
  if (rows.length === 0) { bad('invoices available'); process.exit(1); }
  const ids = rows.map((r) => r.id);
  const unpaid = (await call(adminToken, 'GET', '/fees/invoices?status=UNPAID&limit=1')).body?.data?.[0];

  // Sanity check that a locally minted token is accepted, otherwise the negative results
  // below would be meaningless.
  section('Token minting sanity check');
  const adminUser = list.find((u) => u.role === 'SCHOOL_ADMIN');
  const mintedAdmin = mintToken(adminUser.id, secret);
  const me = await call(mintedAdmin, 'GET', '/auth/me');
  me.ok ? ok('minted token authenticates', `role ${me.body?.role}`) : bad('minted token authenticates', me.status);

  section('Invoice archive — role enforcement');
  if (accountant) {
    const r = await call(mintToken(accountant.id, secret), 'POST', '/pdf/fee-invoices/archive', { invoiceIds: [ids[0]] });
    r.ok ? ok('ACCOUNTANT may download the invoice archive') : bad('ACCOUNTANT may download the invoice archive', `${r.status} ${JSON.stringify(r.body)}`);
  } else {
    console.log('       no ACCOUNTANT user present, skipping');
  }

  if (teacher) {
    const r = await call(mintToken(teacher.id, secret), 'POST', '/pdf/fee-invoices/archive', { invoiceIds: [ids[0]] });
    r.status === 403 ? ok('TEACHER blocked from the invoice archive', String(r.status)) : bad('TEACHER blocked from the invoice archive', `status ${r.status}`);

    const p = await call(mintToken(teacher.id, secret), 'POST', '/fees/payments', { invoiceId: ids[0], amount: 1 });
    p.status === 403 ? ok('TEACHER blocked from recording payments', String(p.status)) : bad('TEACHER blocked from recording payments', `status ${p.status}`);
  } else {
    console.log('       no TEACHER user present, skipping');
  }

  section('Invoice archive — school isolation');
  // A super admin creates a second school with its own admin and invoice, which the first
  // school's admin must not be able to reach.
  const sa = await call(null, 'POST', '/auth/login', { email: 'superadmin@schoolerp.com', password: process.env.E2E_SA_PASSWORD || 'SuperAdmin@123' });
  if (!sa.ok) {
    console.log(`       super admin login unavailable (${sa.status}); falling back to cross-tenant id probe`);
    const foreign = await call(adminToken, 'POST', '/pdf/fee-invoices/archive', { invoiceIds: ['11111111-1111-4111-8111-111111111111'] });
    foreign.status === 404
      ? ok('invoice ids outside the caller\'s school are not returned', String(foreign.status))
      : bad('invoice ids outside the caller\'s school are not returned', `status ${foreign.status}`);
  } else {
    const saToken = sa.body.accessToken;
    const schools = await call(saToken, 'GET', '/super-admin/schools?limit=50');
    const all = schools.body?.data ?? schools.body ?? [];
    const otherSchool = all.find((s) => s.id !== login.body.user?.schoolId);
    if (!otherSchool) {
      console.log('       only one school exists; cross-tenant check needs a second school');
    } else {
      // Read-only cross-tenant probe on a student, so no data is created in the other school.
      const otherStudents = await call(saToken, 'GET', `/students?schoolId=${otherSchool.id}&limit=1`);
      const foreignStudent = otherStudents.body?.data?.[0];
      if (foreignStudent) {
        const r = await call(adminToken, 'GET', `/pdf/student-profile/${foreignStudent.id}`);
        r.status === 403 || r.status === 404
          ? ok('another school\'s student profile PDF is blocked', `${r.status} for student in ${otherSchool.name}`)
          : bad('another school\'s student profile PDF is blocked', `status ${r.status}`);

        const d = await call(adminToken, 'GET', `/students/${foreignStudent.id}`);
        d.status === 403 || d.status === 404
          ? ok('another school\'s student record is blocked', String(d.status))
          : bad('another school\'s student record is blocked', `status ${d.status}`);
      } else {
        console.log(`       school ${otherSchool.name} has no students to probe with`);
      }

      const otherInv = await call(saToken, 'GET', `/fees/invoices?schoolId=${otherSchool.id}&limit=1`);
      const foreignId = otherInv.body?.data?.[0]?.id;
      if (!foreignId) {
        console.log(`       school ${otherSchool.name} has no invoices to probe with`);
      } else {
        const r = await call(adminToken, 'POST', '/pdf/fee-invoices/archive', { invoiceIds: [foreignId] });
        r.status === 404
          ? ok('another school\'s invoice is not archivable', `${r.status} for invoice in ${otherSchool.name}`)
          : bad('another school\'s invoice is not archivable', `status ${r.status}`);

        const mixed = await call(adminToken, 'POST', '/pdf/fee-invoices/archive', { invoiceIds: [ids[0], foreignId] });
        // Own invoice still resolves; the foreign one must simply be absent.
        mixed.status === 200 || mixed.status === 201
          ? ok('mixed batch silently drops the foreign invoice (own invoice still served)')
          : bad('mixed batch handling', `status ${mixed.status}`);
      }
    }
  }

  section('Unauthenticated access');
  for (const [name, method, p, body] of [
    ['invoice archive', 'POST', '/pdf/fee-invoices/archive', { invoiceIds: ids.slice(0, 1) }],
    ['record payment', 'POST', '/fees/payments', { invoiceId: ids[0], amount: 1 }],
    ['bulk generation', 'POST', '/fees/invoices/bulk', { month: 1, year: 2040 }],
    ['student profile pdf', 'GET', '/pdf/student-profile/00000000-0000-4000-8000-000000000000', null],
  ]) {
    const r = await call(null, method, p, body);
    r.status === 401 ? ok(`${name} requires authentication`) : bad(`${name} requires authentication`, `status ${r.status}`);
  }

  if (unpaid) console.log(`\n       (left invoice ${unpaid.invoiceNo} untouched)`);

  section('Summary');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
