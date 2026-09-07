/**
 * Production SSR + static server for Render (no nginx).
 * Docker still uses nginx + scripts/docker-server.mjs.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const root = dirname(fileURLToPath(import.meta.url));
const clientDir = join(root, "..", "dist", "client");
const serverCandidates = [
  join(root, "..", "dist", "server", "server.js"),
  join(root, "..", "dist", "server", "index.js"),
];

const MIME = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function tryStatic(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/health" || url.pathname === "/health/") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("ok\n");
    return true;
  }
  if (!url.pathname.startsWith("/assets/") && url.pathname !== "/favicon.ico") {
    return false;
  }
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const full = normalize(join(clientDir, relative));
  const rootNorm = normalize(clientDir);
  if (!full.startsWith(rootNorm)) return false;
  if (!existsSync(full) || !statSync(full).isFile()) return false;
  res.statusCode = 200;
  res.setHeader("content-type", MIME[extname(full).toLowerCase()] || "application/octet-stream");
  res.setHeader("cache-control", "public, max-age=31536000, immutable");
  createReadStream(full).pipe(res);
  return true;
}

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const entryPath = serverCandidates.find((p) => existsSync(p));
if (!entryPath) {
  console.error("TanStack server bundle not found. Run npm run build first.");
  process.exit(1);
}

const handler = await import(entryPath).then((m) => m.default ?? m);

createServer(async (req, res) => {
  try {
    if (tryStatic(req, res)) return;

    const host = req.headers.host ?? `localhost:${PORT}`;
    const proto = req.headers["x-forwarded-proto"] || "http";
    const url = new URL(req.url ?? "/", `${proto}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null) continue;
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else headers.set(key, value);
    }

    const body = await readBody(req);
    const request = new Request(url.toString(), { method: req.method, headers, body });
    const response = await handler.fetch(request);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      res.setHeader(key, value);
    });

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (error) {
    console.error("[render-server]", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
  }
}).listen(PORT, HOST, () => {
  console.log(`Clever Campus frontend listening on http://${HOST}:${PORT}`);
});
