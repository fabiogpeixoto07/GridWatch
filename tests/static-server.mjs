import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const staticRoot = fileURLToPath(new URL("../iis-dist/", import.meta.url)).replace(/[\\/]$/, "");

const mime = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

export function resolvePublicPath(requestPath) {
  const pathname = decodeURIComponent(new URL(requestPath, "http://localhost").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const target = normalize(join(staticRoot, relative));
  if (!target.startsWith(`${staticRoot}${sep}`) && target !== staticRoot) return null;
  return target;
}

export function createStaticServer() {
  return createServer(async (request, response) => {
    const target = resolvePublicPath(request.url ?? "/");
    if (!target) { response.writeHead(400).end("Bad request"); return; }
    try {
      const file = await stat(target);
      if (!file.isFile()) throw new Error("not a file");
      response.writeHead(200, { "content-type": mime[target.slice(target.lastIndexOf("."))] ?? "application/octet-stream" });
      createReadStream(target).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}
