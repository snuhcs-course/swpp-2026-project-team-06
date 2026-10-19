// 운영자 승인 웹의 중계(DEV-82). 브라우저 → 이 함수 → 실서버 /admin/producers.
// 실서버 CORS는 소비자·생산자 앱 주소만 허용하므로 서버 쪽에서 대신 부른다.
// /admin/producers 아래 경로만 넘긴다. 접속 비밀번호(ADMIN_WEB_PASSWORD)가 맞으면
// 이 함수 환경 변수에 둔 운영자 토큰(ADMIN_TOKEN)을 붙인다. 토큰은 브라우저로 가지 않는다.
import { createHash, timingSafeEqual } from "node:crypto";

const API_BASE = (process.env.FARMCLUB_API_URL || "https://api.farmclub.kr").replace(/\/+$/, "");
const ALLOWED = /^\/admin\/producers(\/[A-Za-z0-9_-]+\/(approve|reject|decisions))?(\?[A-Za-z0-9=&_-]*)?$/;

const digest = (v) => createHash("sha256").update(String(v)).digest();
const passwordOk = (given) =>
  Boolean(given) && timingSafeEqual(digest(given), digest(process.env.ADMIN_WEB_PASSWORD));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, status, code, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ code, message }));
}

async function readBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://local");
  const path = url.searchParams.get("path") || "";
  if (!ALLOWED.test(path) || !["GET", "POST"].includes(req.method)) {
    return send(res, 400, "BAD_PROXY_PATH", "허용하지 않는 경로예요.");
  }
  if (!process.env.ADMIN_WEB_PASSWORD || !process.env.ADMIN_TOKEN) {
    return send(res, 503, "NOT_CONFIGURED", "중계에 비밀번호·운영자 토큰이 설정되지 않았어요.");
  }
  if (!passwordOk(req.headers["x-admin-password"])) {
    await sleep(800); // 비밀번호 대입을 느리게 한다
    return send(res, 401, "BAD_PASSWORD", "비밀번호가 맞지 않아요.");
  }
  const headers = { Accept: "application/json", Authorization: "Bearer " + process.env.ADMIN_TOKEN };
  for (const h of ["idempotency-key", "content-type"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  try {
    const upstream = await fetch(API_BASE + path, {
      method: req.method,
      headers,
      body: req.method === "POST" ? await readBody(req) : undefined,
    });
    if (upstream.status === 401 || upstream.status === 403) {
      return send(res, 503, "ADMIN_TOKEN_INVALID", "중계의 운영자 토큰이 만료됐거나 잘못됐어요. 재발급해 ADMIN_TOKEN을 바꿔 주세요.");
    }
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(await upstream.text());
  } catch {
    send(res, 502, "UPSTREAM_ERROR", "실서버에 연결하지 못했어요.");
  }
}
