// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import http from "node:http";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/** Forwards /api to Nest before TanStack SSR can swallow the request. */
function nestApiProxy(): Plugin {
  return {
    name: "nest-api-proxy",
    configureServer(server) {
      const handle: Connect.NextHandleFunction = (req, res, next) => {
        const url = req.url || "";
        if (url !== "/api" && !url.startsWith("/api/") && !url.startsWith("/api?")) {
          next();
          return;
        }
        const proxy = http.request(
          {
            hostname: "127.0.0.1",
            port: 3000,
            path: url,
            method: req.method,
            headers: { ...req.headers, host: "127.0.0.1:3000" },
          },
          (upstream) => {
            const headers = { ...upstream.headers };
            delete headers["transfer-encoding"];
            delete headers["connection"];
            delete headers["keep-alive"];
            res.writeHead(upstream.statusCode || 502, headers);
            upstream.pipe(res);
          },
        );
        proxy.on("error", () => {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              message: "API server is not reachable. Start the backend on port 3000.",
            }),
          );
        });
        req.pipe(proxy);
      };
      server.middlewares.stack.unshift({ route: "", handle });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [nestApiProxy()],
    server: {
      proxy: {
        "/api": {
          target: "http://127.0.0.1:3000",
          changeOrigin: true,
        },
      },
    },
  },
});
