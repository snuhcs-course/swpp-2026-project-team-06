// 관리자 페이지 공용 스크립트(DEV-83): 사이드바 메뉴, 중계 호출, 알림.
// 메뉴를 늘리려면 NAV에 한 줄 추가하고 api/page.js PAGES·vercel.json rewrites에도 넣는다.
const NAV = [
  { href: "/producers", label: "가입 신청" },
  { href: "/capacity", label: "공급 물량 승인" },
  { href: "/farms", label: "테스트 농가" },
  { href: "/users", label: "사용자" },
  { href: "/user", label: "사용자 찾기" },
  { href: "/inbox", label: "문의함" },
];

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = (iso) => iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }) : "—";

function renderNav() {
  const here = location.pathname.replace(/\/+$/, "");
  $("#side").innerHTML = `
    <div class="head"><a class="brand" href="/">farmclub<i></i></a><span class="tag">관리자</span></div>
    <nav aria-label="관리 메뉴">${NAV.map((n) =>
      `<a href="${n.href}"${n.href === here ? ' aria-current="page"' : ""}>${esc(n.label)}</a>`).join("")}</nav>
    <div class="foot">
      <span class="hint">공용 비밀번호 · 결정은 u-admin으로 기록</span>
      <form method="post" action="/api/logout"><button type="submit">로그아웃</button></form>
    </div>`;
}

function toast(msg, err) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3000);
}

// 중계 호출. 세션이 끝났으면(401) 로그인으로 보내고 돌아올 곳을 남긴다.
async function call(path, method = "GET", body) {
  const headers = {};
  if (method === "POST") { headers["Idempotency-Key"] = crypto.randomUUID(); headers["Content-Type"] = "application/json"; }
  const r = await fetch("/api/proxy?path=" + encodeURIComponent(path), {
    method, headers, credentials: "same-origin", body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (r.status === 401 && data && data.code === "NOT_LOGGED_IN") {
    location.href = "/login?next=" + encodeURIComponent(location.pathname);
    throw new Error("로그인이 필요해요.");
  }
  if (!r.ok) throw new Error((data && data.message) || `요청이 실패했어요 (${r.status})`);
  return data;
}

renderNav();
