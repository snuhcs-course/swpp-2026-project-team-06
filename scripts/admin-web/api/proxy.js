// 운영자 승인 웹의 중계(DEV-82). 브라우저 → 이 함수 → 실서버 /admin/producers.
// 실서버 CORS는 소비자·생산자 앱 주소만 허용하므로 서버 쪽에서 대신 부른다.
// /admin/producers 아래 경로만 넘기고, 운영자 토큰(Authorization)은 저장하지 않고 그대로 전달한다.
const API_BASE = (process.env.FARMCLUB_API_URL || "https://api.farmclub.kr").replace(/\/+$/, "");
const ALLOWED = /^\/admin\/producers(\/[A-Za-z0-9_-]+\/(approve|reject|decisions))?(\?[A-Za-z0-9=&_-]*)?$/;

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
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ code: "BAD_PROXY_PATH", message: "허용하지 않는 경로예요." }));
    return;
  }
  const headers = { Accept: "application/json" };
  for (const h of ["authorization", "idempotency-key", "content-type"]) {
    if (req.headers[h]) headers[h] = req.headers[h];
  }
  try {
    const upstream = await fetch(API_BASE + path, {
      method: req.method,
      headers,
      body: req.method === "POST" ? await readBody(req) : undefined,
    });
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(await upstream.text());
  } catch {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ code: "UPSTREAM_ERROR", message: "실서버에 연결하지 못했어요." }));
  }
}
