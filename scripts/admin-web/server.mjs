// 로컬 실행: node scripts/admin-web/server.mjs → http://127.0.0.1:8090 (DEV-82)
// Vercel과 같은 중계(api/proxy.js)를 쓴다. 실서버 주소는 FARMCLUB_API_URL(기본 https://api.farmclub.kr).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import handler from "./api/proxy.js";

const PORT = Number(process.env.PORT || 8090);
const page = new URL("./index.html", import.meta.url);

createServer(async (req, res) => {
  if (req.url.startsWith("/api/proxy")) return handler(req, res);
  if (req.url === "/" || req.url.startsWith("/?")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(readFileSync(page));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
}).listen(PORT, "127.0.0.1", () =>
  console.log(`farmclub 운영자 승인 웹: http://127.0.0.1:${PORT} → ${process.env.FARMCLUB_API_URL || "https://api.farmclub.kr"}`),
);
