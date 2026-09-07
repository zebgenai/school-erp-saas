/**
 * Production SSR server for Docker — wraps TanStack Start fetch handler.
 * Nginx serves /assets/* statically; HTML routes are proxied here.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.SSR_PORT || 3001);
const HOST = process.env.SSR_HOST || "127.0.0.1";

async function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const handler = await import("../dist/server/server.js").then((m) => m.default ?? m);

createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? `localhost:${PORT}`;
    const url = new URL(req.url ?? "/", `http://${host}`);

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
    console.error("[docker-server]", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
  }
}).listen(PORT, HOST, () => {
  console.log(`TanStack Start SSR listening on http://${HOST}:${PORT}`);
});
