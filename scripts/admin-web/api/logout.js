// 관리자 로그아웃(DEV-83). 화면의 로그아웃 폼이 POST로 부른다 → 쿠키 지우고 /login으로.
import { clearSession, redirect, sameOrigin, sendJson } from "./_lib/session.js";

export default function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD", message: "POST만 받아요." });
  if (!sameOrigin(req)) return sendJson(res, 403, { code: "BAD_ORIGIN", message: "다른 사이트에서 보낸 요청이에요." });
  clearSession(req, res);
  redirect(res, "/login", 303);
}
