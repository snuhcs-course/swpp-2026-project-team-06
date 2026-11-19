// 관리자 페이지 공용 스크립트(DEV-83): 사이드바 메뉴, 중계 호출, 알림.
// 메뉴를 늘리려면 NAV에 한 줄 추가하고 api/page.js PAGES·vercel.json rewrites에도 넣는다.
const NAV = [
  { href: "/producers", label: "가입 신청" },
  { href: "/id-accounts", label: "아이디 계정" }, // 운영자가 만드는 아이디 계정(DEV-363)
  { href: "/capacity", label: "공급 물량 승인" },
  { href: "/farms", label: "테스트 농가" },
  { href: "/users", label: "사용자" },
  { href: "/user", label: "사용자 찾기" },
  { href: "/inbox", label: "문의함" },
  { href: "/ai-cost", label: "AI 비용" },
];

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const when = (iso) => iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" }) : "—";

function renderNav() {
  const here = location.pathname.replace(/\/+$/, "");
  $("#side").innerHTML = `
    <div class="head"><a class="brand" href="/"><img src="/assets/brand-logo.png" alt="Farmclub" width="96" height="72"></a><span class="tag">관리자</span></div>
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
  if (!r.ok) {
    const err = new Error((data && data.message) || `요청이 실패했어요 (${r.status})`);
    err.status = r.status; err.code = data && data.code; // 화면이 오류 종류를 가를 수 있게(DEV-307)
    err.fields = (data && data.details && data.details.fields) || {}; // 칸별 오류(DEV-363 아이디 계정 만들기)
    throw err;
  }
  return data;
}

// 한 번만 보이는 값(임시 비밀번호, DEV-363). 값은 화면(DOM)에만 두고 변수·저장소·콘솔에 남기지 않는다.
// 닫기, 목록 다시 그리기(innerHTML 교체), 페이지 떠나기(pagehide: 뒤로 가기 캐시로 돌아와도 안 보이게)에 지운다
const SECRET_NOTE = "이 창을 닫으면 다시 볼 수 없어요. 사용자에게 알려 주면, 로그인한 뒤 바로 새 비밀번호로 바꿔요.";
function secretBox(value, username, note = SECRET_NOTE) {
  return `<div class="secret-box" role="alert">
    <strong>임시 비밀번호 · 한 번만 보여요</strong>
    <div class="row"><code class="secret" data-secret>${esc(value)}</code>
      <button type="button" class="primary" data-act="secret-copy">복사</button><button type="button" class="text" data-act="secret-close">닫기</button></div>
    <p class="hint">아이디 <code>${esc(username)}</code> · ${esc(note)}</p>
  </div>`;
}
function clearSecrets() { document.querySelectorAll(".secret-box").forEach((el) => el.remove()); }
addEventListener("pagehide", clearSecrets);

// 복사·닫기 버튼이면 처리하고 true
function secretAction(b) {
  const box = b.closest(".secret-box");
  if (!box) return false;
  if (b.dataset.act === "secret-close") box.remove();
  else if (b.dataset.act === "secret-copy") {
    navigator.clipboard.writeText(box.querySelector("[data-secret]").textContent)
      .then(() => toast("복사했어요"), () => toast("복사하지 못했어요. 글자를 직접 골라 복사해 주세요.", true));
  }
  return true;
}

// 아이디 계정 임시 비밀번호 다시 발급(AC-01-31). 첫 클릭은 경고, 두 번째에 발급해 slot에 한 번만 보인다
async function issueTemporaryPassword(b, slot, id, who) {
  if (b.dataset.confirm !== "1") {
    b.dataset.confirm = "1";
    b.textContent = `${who}에게 임시 비밀번호를 줄까요? 한 번 더 누르기`;
    slot.innerHTML = `<p class="error">이 사용자의 지금 비밀번호와 모든 로그인이 바로 풀려요. 사용자에게 새 임시 비밀번호를 알려 줘야 다시 들어올 수 있어요.</p>`;
    return;
  }
  if (issueTemporaryPassword.busy) return;
  issueTemporaryPassword.busy = true; b.disabled = true;
  try {
    const r = await call(`/admin/users/${id}/temporary-password`, "POST");
    slot.innerHTML = secretBox(r.temporaryPassword, r.username);
    toast(`${who}의 임시 비밀번호를 만들었어요`);
  } catch (err) { slot.innerHTML = ""; toast(err.message, true); }
  finally { issueTemporaryPassword.busy = false; b.disabled = false; b.dataset.confirm = ""; b.textContent = "임시 비밀번호"; }
}

renderNav();
