// 로컬 실행: node scripts/admin-web/server.mjs → http://127.0.0.1:8090 (DEV-82, DEV-83)
// Vercel과 같은 함수(api/*.js)와 같은 경로 규칙(vercel.json rewrites)을 쓴다.
// 실서버 주소는 FARMCLUB_API_URL(기본 https://api.farmclub.kr).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import page from "./api/page.js";
import proxy from "./api/proxy.js";
import login from "./api/login.js";
import logout from "./api/logout.js";

const PORT = Number(process.env.PORT || 8090);
const root = new URL("./", import.meta.url);
const functions = { "/api/page": page, "/api/proxy": proxy, "/api/login": login, "/api/logout": logout };
const rewrites = JSON.parse(readFileSync(new URL("vercel.json", root))).rewrites;
const types = { ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://local");
  const rule = rewrites.find((r) => r.source === url.pathname);
  if (rule) {
    const dest = new URL(rule.destination, "http://local");
    url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
    req.url = dest.pathname + dest.search;
    return functions[dest.pathname](req, res);
  }
  if (functions[url.pathname]) return functions[url.pathname](req, res);
  const asset = url.pathname.match(/^\/assets\/([a-z-]+(\.css|\.js))$/);
  if (asset) {
    res.setHeader("Content-Type", types[asset[2]]);
    res.end(readFileSync(new URL("assets/" + asset[1], root)));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
}).listen(PORT, "127.0.0.1", () =>
  console.log(`farmclub 관리자 페이지: http://127.0.0.1:${PORT} → ${process.env.FARMCLUB_API_URL || "https://api.farmclub.kr"}`),
);
