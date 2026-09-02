import * as fs from 'fs';
import * as path from 'path';

/**
 * Single source of truth for where uploaded files live on disk.
 *
 * Both the uploads module (writing/serving) and the PDF renderer (embedding the school
 * logo) need this path. Deriving it from `process.cwd()` in each place meant the logo
 * silently disappeared from PDFs whenever the process was started from another directory,
 * so it is resolved once here and can be pinned with the UPLOAD_DIR env var in deployments
 * where the working directory is not the backend root.
 */
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');

export function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Map a stored file URL such as "/uploads/abc.png" to its absolute path on disk.
 * Returns null when the file is missing so callers can degrade gracefully.
 */
export function resolveUploadDiskPath(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;
  const filename = path.basename(fileUrl);
  if (!filename || filename === '.' || filename === '..') return null;
  const full = path.join(UPLOAD_DIR, filename);
  return fs.existsSync(full) ? full : null;
}
