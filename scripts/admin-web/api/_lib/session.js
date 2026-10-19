// 관리자 페이지 세션(DEV-83). 로그인 때 공용 비밀번호(ADMIN_WEB_PASSWORD)를 한 번 확인하고
// 서명 쿠키를 준다. 서명 키는 비밀번호에서 만들므로 비밀번호를 바꾸면 기존 로그인이 모두 풀린다.
// 쿠키 값: v1.<만료 ms>.<HMAC-SHA256 base64url>. 밑줄로 시작하는 폴더라 Vercel 함수가 되지 않는다.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "fc_admin";
export const SESSION_HOURS = 12;
const VERSION = "v1";

const digest = (v) => createHash("sha256").update(String(v)).digest();
const key = () => digest("farmclub-admin-session:" + VERSION + ":" + process.env.ADMIN_WEB_PASSWORD);
const sign = (payload) => createHmac("sha256", key()).update(payload).digest("base64url");
const sameBytes = (a, b) => a.length === b.length && timingSafeEqual(a, b);

export const configured = () => Boolean(process.env.ADMIN_WEB_PASSWORD && process.env.ADMIN_TOKEN);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function passwordOk(given) {
  return Boolean(given) && timingSafeEqual(digest(given), digest(process.env.ADMIN_WEB_PASSWORD));
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}

export function loggedIn(req) {
  if (!configured()) return false;
  const [ver, exp, mac] = readCookie(req, COOKIE).split(".");
  if (ver !== VERSION || !/^\d+$/.test(exp || "") || !mac) return false;
  if (!sameBytes(Buffer.from(mac), Buffer.from(sign(ver + "." + exp)))) return false;
  return Number(exp) > Date.now();
}

// 로컬 http(127.0.0.1)에서는 Secure를 빼야 쿠키가 남는다. 배포(https)에서는 항상 붙인다.
function secure(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "");
  const host = String(req.headers.host || "");
  return proto === "https" || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
}

export function setSession(req, res) {
  const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  const value = VERSION + "." + exp + "." + sign(VERSION + "." + exp);
  res.setHeader("Set-Cookie", cookie(req, value, SESSION_HOURS * 3600));
}

export function clearSession(req, res) {
  res.setHeader("Set-Cookie", cookie(req, "", 0));
}

function cookie(req, value, maxAge) {
  return [`${COOKIE}=${value}`, "Path=/", `Max-Age=${maxAge}`, "HttpOnly", "SameSite=Strict"]
    .concat(secure(req) ? ["Secure"] : [])
    .join("; ");
}

// 다른 사이트에서 보낸 POST를 막는다(SameSite=Strict에 더해). Origin이 없으면(같은 출처 일부 요청) 통과.
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function redirect(res, location, status = 302) {
  res.statusCode = status;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.end();
}

// 로그인 뒤 돌아갈 곳. 같은 사이트 경로만 받는다("//다른곳" 막기).
export function safeNext(v) {
  return typeof v === "string" && /^\/(?!\/)[A-Za-z0-9/_?=&-]*$/.test(v) ? v : "/producers";
}

export async function readBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
}
