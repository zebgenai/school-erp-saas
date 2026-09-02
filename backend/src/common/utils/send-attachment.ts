import { Response } from 'express';
import { applyCorsHeaders } from './cors-origin';

/** Write a file download with CORS headers already on the wire — StreamableFile can omit them. */
export function sendAttachment(
  res: Response,
  buffer: Buffer,
  contentType: string,
  filename: string,
) {
  const allowed: string[] = res.req.app?.locals?.corsOrigins ?? [];
  const isProd = Boolean(res.req.app?.locals?.corsIsProd);
  applyCorsHeaders(res.req, res, allowed, isProd);
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', String(buffer.length));
  res.end(buffer);
}
