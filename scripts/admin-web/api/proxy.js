// 관리자 페이지의 중계(DEV-82, DEV-83, DEV-87, DEV-98). 브라우저 → 이 함수 → 실서버 /admin/….
// 실서버 CORS는 소비자·생산자 앱 주소만 허용하므로 서버 쪽에서 대신 부른다.
// 아래 ALLOWED 경로만 넘긴다(가입 신청, 공급 물량 신청, 테스트 농가 숨기기 DEV-98). 로그인 세션 쿠키가 맞으면
// 이 함수 환경 변수에 둔 운영자 토큰(ADMIN_TOKEN)을 붙인다. 토큰은 브라우저로 가지 않는다.
import { configured, loggedIn, readBody, sameOrigin, sendJson } from "./_lib/session.js";

const API_BASE = (process.env.FARMCLUB_API_URL || "https://api.farmclub.kr").replace(/\/+$/, "");
const QUERY = "(\\?[A-Za-z0-9=&_-]*)?";
const ID = "[A-Za-z0-9_-]+";
const ALLOWED = [
  new RegExp(`^/admin/producers(/${ID}/(approve|reject|decisions))?${QUERY}$`),
  new RegExp(`^/admin/capacity-requests${QUERY}$`),
  new RegExp(`^/admin/products/${ID}/capacity-requests/${ID}/(approve|reject)$`),
  new RegExp(`^/admin/farms(/${ID}/(preview|retire|restore))?$`),
  // 사용자 검색어는 한글이라 퍼센트 인코딩(%·+·.)까지 받는다(DEV-107)
  new RegExp(`^/admin/users(\\?[A-Za-z0-9=&_%.+-]*)?$`),
  new RegExp(`^/admin/users/${ID}/(mark|unmark)-tester$`),
];

const send = (res, status, code, message) => sendJson(res, status, { code, message });

export default async function handler(req, res) {
  const url = new URL(req.url, "http://local");
  const path = url.searchParams.get("path") || "";
  if (!ALLOWED.some((re) => re.test(path)) || !["GET", "POST"].includes(req.method)) {
    return send(res, 400, "BAD_PROXY_PATH", "허용하지 않는 경로예요.");
  }
  if (!configured()) {
    return send(res, 503, "NOT_CONFIGURED", "중계에 비밀번호·운영자 토큰이 설정되지 않았어요.");
  }
  if (!loggedIn(req)) {
    return send(res, 401, "NOT_LOGGED_IN", "로그인이 필요해요.");
  }
  if (req.method === "POST" && !sameOrigin(req)) {
    return send(res, 403, "BAD_ORIGIN", "다른 사이트에서 보낸 요청이에요.");
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
