import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

export function createStaticServer(root) {
  return createServer(async (request, response) => {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const base = await realpath(root);
      const candidate = resolve(
        base,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      const file = await realpath(candidate);
      const local = relative(base, file);
      if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
        response.writeHead(403).end();
        return;
      }
      if (!(await stat(file)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const data = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Content-Length": data.length,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : data);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : 404).end();
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    await stat(resolve(projectRoot, "dist/index.html"));
  } catch {
    console.error("Build the app first: npm install && npm run build");
    process.exit(1);
  }
  const server = createStaticServer(resolve(projectRoot, "dist"));
  server.on("error", (error) => {
    console.error(`Cannot start GitHub View: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(4173, "127.0.0.1", () =>
    console.log("GitHub View: http://127.0.0.1:4173"),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close());
}
