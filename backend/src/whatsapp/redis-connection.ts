/** Parse REDIS_URL into a BullMQ/ioredis connection options object. */
export function parseRedisConnection(redisUrl?: string | null) {
  const raw = (redisUrl || 'redis://127.0.0.1:6379').trim();
  const u = new URL(raw);
  return {
    host: u.hostname || '127.0.0.1',
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    maxRetriesPerRequest: null as null,
    enableReadyCheck: false,
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
