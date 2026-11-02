// Admin page demo. Run against `npm run demo` (fresh seed) and the admin page pointed at the demo API:
//   PORT=8090 ADMIN_WEB_PASSWORD=<pw> ADMIN_TOKEN=<token from npm run demo> FARMCLUB_API_URL=http://127.0.0.1:8000 node scripts/admin-web/server.mjs
//   ADMIN_WEB_PASSWORD=<pw> node demo/record/admin.mjs   → demo/.raw/admin.webm
import { producerUrl, startRecording } from "./lib.mjs";

const adminUrl = process.env.FARMCLUB_ADMIN_URL ?? "http://127.0.0.1:8090";
const password = process.env.ADMIN_WEB_PASSWORD;
if (!password) throw new Error("ADMIN_WEB_PASSWORD is required (the admin page's shared password)");

// 넓은 화면이라 캡션은 본문 아래 빈 곳에 둔다
const r = await startRecording("admin", "farmclub 관리자 페이지", { left: 640, top: 560, width: 600, card: true });
const { page, cap, go, tap, type, wait } = r;
const btn = (name, opts = {}) => page.getByRole("button", { name, ...opts });

try {
  // 1. 로그인
  await go(`${adminUrl}/login`);
  await cap("관리자 로그인", "운영자는 공용 접속 비밀번호로 로그인해요.\n승인·반려는 모두 운영자 계정(u-admin) 이름으로 기록돼요.", "DEV-82·83 · ADR 0008");
  await type(page.locator("input[type=password]"), password, { after: 400 });
  await tap(btn("로그인"), { after: 1800 });

  // 2. 농가 가입 신청 승인
  await cap("농가 가입 신청", "확인 중인 신청의 대표자·연락처·지역·작물을 보고\n승인하거나 사유를 붙여 반려해요.\n승인은 두 번 눌러 확인해요.", "FEAT-01 · AC-01");
  await wait(1500);
  await tap(btn("승인", { exact: true }).first(), { after: 900 });
  await tap(page.getByRole("button", { name: /한 번 더 누르기/ }).first(), { after: 2000 });
  await tap(btn(/^승인 \d+/), { after: 1500 });
  await tap(btn("결정 이력").first(), { after: 1800 });

  // 3. 공급 물량 승인
  await cap("공급 물량 승인", "생산자가 신청한 총중량을 그대로 승인해요.\n첫 판매 승인이면 상품이 바로 판매 중이 돼요.", "FEAT-04 · DEV-87");
  await tap(page.getByRole("link", { name: "공급 물량 승인" }), { after: 1800 });
  await tap(btn("승인", { exact: true }).first(), { after: 900 });
  await tap(page.getByRole("button", { name: /한 번 더 누르기/ }).first(), { after: 2000 });
  await tap(btn(/^승인 \d+/), { after: 2000 });

  // 4. 결과: 승인된 농가는 생산자 앱으로 바로 들어가요
  await cap("승인 결과", "방금 승인한 위미 감귤농장(오미숙)은\n생산자 앱에서 승인 대기 없이 바로 현황으로 들어가요.", "FEAT-01");
  await go(`${producerUrl}/login`);
  // 앱 화면에서는 캡션을 앱 기둥 왼쪽 여백으로
  const leftCap = () => page.evaluate(() => Object.assign(document.getElementById("dc-cap").style, { left: "28px", top: "40px", width: "330px", background: "none", border: "0", boxShadow: "none", padding: "0" })).catch(() => {});
  await leftCap();
  await tap(page.getByRole("radio", { name: /오미숙/ }));
  await tap(btn(/시작하기$/), { after: 2500 });
  await leftCap();
  await cap("끝", "관리자 페이지: 로그인 → 농가 가입 신청 승인\n→ 공급 물량 승인 → 생산자 앱에서 결과 확인");
  await wait(2500);
} catch (e) {
  await page.screenshot({ path: "demo/.raw/admin-fail.png" });
  console.error("FAILED at", page.url(), e.message.split("\n")[0]);
  console.error((await page.evaluate(() => [...document.querySelectorAll("button,a,input,[role=radio]")].map((x) => `${x.tagName}:${(x.getAttribute("aria-label") || x.textContent || "").trim().slice(0, 25)}`))).join(" | ").slice(0, 1500));
  process.exitCode = 1;
} finally {
  console.log(await r.finish("demo/.raw/admin.webm"));
}
