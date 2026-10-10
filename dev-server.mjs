// Local preview: node dev-server.mjs  -> http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import handler from "./api/stats.js";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/api/stats") {
    req.query = Object.fromEntries(u.searchParams);
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (o) => (res.setHeader("Content-Type", "application/json"), res.end(JSON.stringify(o)));
    return handler(req, res);
  }
  const f = path.join(process.cwd(), u.pathname === "/" ? "index.html" : u.pathname);
  if (!fs.existsSync(f)) return (res.statusCode = 404), res.end();
  res.setHeader("Content-Type", types[path.extname(f)] || "text/plain");
  fs.createReadStream(f).pipe(res);
}).listen(3000, () => console.log("http://localhost:3000"));
