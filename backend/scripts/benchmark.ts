/**
 * Benchmark key API endpoints against a running backend.
 * Usage: npx ts-node scripts/benchmark.ts [baseUrl] [token]
 *
 * Example:
 *   npx ts-node scripts/benchmark.ts http://localhost:3000/api eyJhbG...
 */
const BASE = process.argv[2] || 'http://localhost:3000/api';
const TOKEN = process.argv[3] || '';

const ENDPOINTS = [
  { name: 'Health ready', path: '/health/ready', auth: false },
  { name: 'Students list', path: '/students', auth: true },
  { name: 'Teachers list', path: '/teachers', auth: true },
  { name: 'Fee invoices', path: '/fees/invoices', auth: true },
  { name: 'Attendance list', path: '/attendance', auth: true },
  { name: 'Reports dashboard', path: '/reports/dashboard-summary', auth: true },
  { name: 'Reports fees', path: '/reports/fees', auth: true },
  { name: 'Reports attendance', path: '/reports/attendance?month=1&year=2024', auth: true },
];

async function timeRequest(name: string, path: string, auth: boolean) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  const start = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, { headers });
    const ms = performance.now() - start;
    const size = res.headers.get('content-length') || '?';
    return { name, status: res.status, ms: ms.toFixed(0), size };
  } catch (err: any) {
    return { name, status: 'ERR', ms: '—', size: err.message };
  }
}

async function main() {
  console.log(`Benchmarking ${BASE}\n`);
  console.log('Endpoint'.padEnd(28), 'Status', 'Time(ms)', 'Size');
  console.log('-'.repeat(60));

  for (const ep of ENDPOINTS) {
    const r = await timeRequest(ep.name, ep.path, ep.auth);
    console.log(r.name.padEnd(28), String(r.status).padEnd(8), String(r.ms).padEnd(10), r.size);
  }
}

main();
