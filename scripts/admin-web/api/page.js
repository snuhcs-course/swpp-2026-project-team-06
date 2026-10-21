// 관리자 페이지 화면을 내려 준다(DEV-83). vercel.json rewrites가 /, /login, /producers를 여기로 보낸다.
// 로그인 안 한 상태로 관리 화면에 오면 /login?next=…으로, 로그인한 상태로 /login에 오면 /producers로 보낸다.
// 화면 HTML(_views)에는 데이터가 없고, 목록·승인은 중계(api/proxy.js)가 세션을 다시 확인한다.
import { readFileSync } from "node:fs";
import { loggedIn, redirect, safeNext } from "./_lib/session.js";

// 관리 화면 목록. 메뉴를 늘리려면 여기와 vercel.json rewrites, assets/admin.js NAV에 함께 추가한다.
const PAGES = { producers: "producers.html", capacity: "capacity.html", farms: "farms.html", user: "user.html" };
const LOGIN = new URL("./_views/login.html", import.meta.url);
const views = Object.fromEntries(Object.entries(PAGES).map(([k, f]) => [k, new URL("./_views/" + f, import.meta.url)]));

function html(res, file) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(readFileSync(file));
}

export default function handler(req, res) {
  const url = new URL(req.url, "http://local");
  const name = url.searchParams.get("name") || "";
  const authed = loggedIn(req);
  if (name === "login") {
    return authed ? redirect(res, safeNext(url.searchParams.get("next"))) : html(res, LOGIN);
  }
  if (name === "home") return redirect(res, authed ? "/producers" : "/login");
  if (!views[name]) return redirect(res, "/");
  // 사용자 상세(DEV-106)는 /users/<id>로 돌아온다
  const id = url.searchParams.get("id") || "";
  const back = name === "user" && /^[A-Za-z0-9_-]+$/.test(id) ? "/users/" + id : "/" + name;
  if (!authed) return redirect(res, "/login?next=" + encodeURIComponent(back));
  html(res, views[name]);
}
