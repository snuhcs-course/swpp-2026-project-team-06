// 관리자 로그인(DEV-83). POST {password} → 맞으면 세션 쿠키. 틀리면 0.8초 늦게 거절한다.
import { configured, passwordOk, readBody, sameOrigin, sendJson, setSession, sleep } from "./_lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD", message: "POST만 받아요." });
  if (!sameOrigin(req)) return sendJson(res, 403, { code: "BAD_ORIGIN", message: "다른 사이트에서 보낸 요청이에요." });
  if (!configured()) {
    return sendJson(res, 503, { code: "NOT_CONFIGURED", message: "중계에 비밀번호·운영자 토큰이 설정되지 않았어요." });
  }
  let password = "";
  try {
    password = String(JSON.parse((await readBody(req)) || "{}").password || "");
  } catch {
    return sendJson(res, 400, { code: "BAD_BODY", message: "요청 형식이 맞지 않아요." });
  }
  if (!passwordOk(password)) {
    await sleep(800); // 비밀번호 대입을 느리게 한다
    return sendJson(res, 401, { code: "BAD_PASSWORD", message: "비밀번호가 맞지 않아요." });
  }
  setSession(req, res);
  sendJson(res, 200, { ok: true });
}
