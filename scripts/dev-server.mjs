import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5173);
const host = "127.0.0.1";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded === "/" ? "/index.html" : decoded);
  const fullPath = path.join(root, normalized);
  if (!fullPath.startsWith(root)) return path.join(root, "index.html");
  return fullPath;
}

const server = http.createServer(async (req, res) => {
  try {
    const requestedPath = safePath(req.url || "/");
    const ext = path.extname(requestedPath);
    const data = await fs.readFile(requestedPath);
    res.writeHead(200, {
      "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    const data = await fs.readFile(path.join(root, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  }
});

server.listen(port, host, () => {
  console.log(`CSC SYNC dev server: http://${host}:${port}`);
});
