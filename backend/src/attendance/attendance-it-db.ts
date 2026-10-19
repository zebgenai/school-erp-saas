import { PrismaClient } from '@prisma/client';

const EXPECTED_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const EXPECTED_PORT = 55432;
const EXPECTED_DATABASE = 'attendance_it';

/** Reads the test URL from the environment and refuses any other target. */
export function attendanceItDatabaseUrl(): string {
  const url = process.env.ATTENDANCE_IT_DATABASE_URL;
  if (!url) {
    throw new Error(
      'ATTENDANCE_IT_DATABASE_URL is not set. Refusing to run attendance integration tests.',
    );
  }
  assertAttendanceItUrl(url);
  return url;
}

export function createAttendanceItPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: attendanceItDatabaseUrl() } },
  });
}

/** One connection, so a session advisory lock stays on the same backend. */
export function createAttendanceItLockSession(): PrismaClient {
  const parsed = new URL(attendanceItDatabaseUrl());
  parsed.searchParams.set('connection_limit', '1');
  return new PrismaClient({
    datasources: { db: { url: parsed.toString() } },
  });
}

export async function assertAttendanceItIdentity(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ db: string; port: number; host: string | null }>>`
    SELECT current_database() AS db,
           inet_server_port() AS port,
           host(inet_server_addr()) AS host
  `;
  const row = rows[0];
  const host = row?.host ?? '';
  if (
    !row ||
    row.db !== EXPECTED_DATABASE ||
    Number(row.port) !== EXPECTED_PORT ||
    !EXPECTED_HOSTS.has(host)
  ) {
    throw new Error(
      'Refusing to run: connected database is not attendance_it on 127.0.0.1 port 55432.',
    );
  }
}

function assertAttendanceItUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('ATTENDANCE_IT_DATABASE_URL is not a URL. Refusing to run.');
  }
  const database = parsed.pathname.replace(/^\//, '').split('/')[0];
  const port = parsed.port ? Number(parsed.port) : 5432;
  if (
    !EXPECTED_HOSTS.has(parsed.hostname) ||
    port !== EXPECTED_PORT ||
    database !== EXPECTED_DATABASE
  ) {
    throw new Error(
      'Refusing to run: ATTENDANCE_IT_DATABASE_URL does not target attendance_it on 127.0.0.1 port 55432.',
    );
  }
}
