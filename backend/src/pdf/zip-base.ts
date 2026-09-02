import archiver from 'archiver';

export interface ZipEntry {
  name: string;
  buffer: Buffer;
}

/**
 * Builds an in-memory ZIP. The archive is buffered rather than streamed because callers
 * return it through `StreamableFile`, which needs a known payload.
 */
export function createZipBuffer(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));

    const used = new Set<string>();
    for (const entry of entries) {
      archive.append(entry.buffer, { name: uniqueName(entry.name, used) });
    }

    archive.finalize().catch(reject);
  });
}

/** ZIP readers handle duplicate names inconsistently, so collisions get a numeric suffix. */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const dot = name.lastIndexOf('.');
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? '' : name.slice(dot);
  let i = 2;
  while (used.has(`${stem}-${i}${ext}`)) i++;
  const unique = `${stem}-${i}${ext}`;
  used.add(unique);
  return unique;
}
