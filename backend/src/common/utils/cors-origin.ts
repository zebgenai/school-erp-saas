import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import type { Request, Response } from 'express';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
];

const CORS_METHODS = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';
const CORS_EXPOSE = 'Content-Disposition, Content-Type';
const CORS_HEADERS_FALLBACK = 'Authorization,Content-Type,Accept';

/**
 * Origins the API will echo back on CORS responses. `CORS_ORIGINS` is additive in
 * development so a production-style env file cannot silently drop localhost:8080
 * (the frontend's current origin) and make PDF fetches look like a CORS failure.
 */
export function allowedCorsOrigins(isProd: boolean, configured?: string): string[] {
  const fromEnv = (configured ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (isProd) return fromEnv;
  return [...new Set([...DEFAULT_DEV_ORIGINS, ...fromEnv])];
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowed: string[],
  isProd = false,
): boolean {
  if (!origin) return true;
  if (allowed.includes(origin)) return true;
  if (isProd) return false;
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function applyCorsHeaders(
  req: Request,
  res: Response,
  allowed: string[],
  isProd = false,
) {
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin, allowed, isProd)) return;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', CORS_METHODS);
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || CORS_HEADERS_FALLBACK,
  );
  res.setHeader('Access-Control-Expose-Headers', CORS_EXPOSE);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

export function nestCorsOptions(allowed: string[], isProd: boolean): CorsOptions {
  return {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, allowed, isProd)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    exposedHeaders: ['Content-Disposition', 'Content-Type'],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  };
}
