// Producer app demo (Iteration 1). Run against `npm run demo` (fresh seed), then:
//   FARMCLUB_ADMIN_TOKEN=<token printed by npm run demo> node demo/record/producer.mjs → demo/.raw/producer.webm
// The AI product draft uses Claude when ANTHROPIC_API_KEY is set in server/.env; otherwise the
// app shows its documented fallback (AC-03-3) and the script fills the fields by hand.
import { apiUrl, producerUrl, startRecording } from "./lib.mjs";

const adminToken = process.env.FARMCLUB_ADMIN_TOKEN;
if (!adminToken) throw new Error("FARMCLUB_ADMIN_TOKEN is required (printed by npm run demo)");

const r = await startRecording("producer", "farmclub 생산자 앱");
const { page, cap, go, tap, type, scroll, wait } = r;
const btn = (name, opts = {}) => page.getByRole("button", { name, ...opts });
const pick = async (...days) => {
  await tap(btn("다음 달"), { after: 300 });
  await tap(btn("다음 달"), { after: 300 });
  for (const d of days) await tap(btn(new RegExp(`^12월 ${d}일`)), { after: 300 });
};

try {
  // 1. 가입 신청
  await cap("농가 가입 신청", "처음 온 농가는 대표자·농가 이름·지역·작물·\n연락처를 적고 입점 정책에 동의해 신청해요.\n운영자가 확인할 때까지 기다려요.", "FEAT-01 · SCR-19·20");
  await go(`${producerUrl}/login`);
  await tap(page.getByRole("radio", { name: /신규 생산자/ }));
  await tap(btn(/시작하기$/), { after: 1500 });
  await type(page.getByLabel("대표자 이름"), "고은별");
  await type(page.getByLabel("농가 이름"), "별빛 감귤농원");
  await type(page.getByLabel("지역"), "제주 서귀포시 남원읍");
  await type(page.getByLabel("주로 키우는 것"), "노지 감귤, 천혜향");
  await type(page.getByLabel("연락처"), "010-2222-3333");
  await tap(page.getByLabel("입점 정책에 동의해요"));
  await tap(btn("신청하기"), { after: 2000 });
  await cap("승인 대기", "신청 상태를 보여 줘요.\n승인되면 바로 판매 준비를 시작할 수 있어요.", "SCR-21");
  await wait(1500);
  await tap(btn("로그아웃"), { after: 1500 });

  // 2. 현황
  await cap("승인된 농가 · 현황", "기간별 예약 현황과 출하할 주문을\n한눈에 봐요.", "FEAT-04 · SCR-22");
  if (!page.url().includes("/login")) await go(`${producerUrl}/login`);
  await tap(page.getByRole("radio", { name: /강영수/ }));
  await tap(btn(/시작하기$/), { after: 2000 });
  await scroll(600);
  await scroll(-600, { steps: 4 });

  // 3. AI 상품 초안
  await cap("AI 상품 초안", "카톡·밴드에 쓰던 문구를 붙여넣으면\nAI(Claude Haiku 4.5)가 상품 정보를 채워요.\n없는 정보는 '확인 필요'로 남겨요.", "FEAT-03 · SCR-24");
  await tap(page.getByRole("tab", { name: /^상품/ }).or(page.getByRole("link", { name: /^상품/ })).first(), { after: 1200 });
  await tap(btn("새 상품"), { after: 1200 });
  await type(page.getByLabel("카톡·밴드에 쓰던 문구"), "[예약] 서귀포 노지 감귤 5kg·10kg\n올해 당도 11.5브릭스 예상, 12월 초 수확해서 바로 보내드려요.\n무료배송(도서산간 3천원 추가)", { after: 800 });
  await tap(btn("초안 만들기"), { after: 500 });
  const ok = page.getByRole("heading", { name: "초안이 나왔어요" }).or(page.getByText("초안이 나왔어요"));
  const failed = page.getByText("초안을 만들지 못했어요");
  await ok.or(failed).first().waitFor({ timeout: 30000 });
  await wait(1500);
  if (await failed.isVisible()) {
    await tap(btn("직접 입력하기"), { after: 1500 });
    await type(page.getByLabel("상품명"), "서귀포 노지 감귤");
  } else {
    await scroll(500);
    await tap(btn("편집으로"), { after: 2000 });
  }

  // 4. 빈 칸 채우기 → 저장
  await cap("빈 칸 채우기", "AI가 못 채운 품종·등급·받는 시기·\n환불 기한을 정하고 저장해요.", "FEAT-03 · SCR-25");
  const variety = page.getByLabel("품종");
  if (!(await variety.inputValue().catch(() => ""))) await type(variety, "온주밀감");
  await tap(page.getByText("상", { exact: true }).first(), { after: 500 });
  await tap(page.getByText("날짜를 골라 주세요").first(), { after: 800 });
  await pick(10, 20);
  await tap(btn("이 기간으로"));
  await tap(page.getByText("날짜를 골라 주세요").first(), { after: 800 });
  await tap(btn(/^12월 31일/), { after: 300 });
  await tap(btn("이 날로"));
  await tap(btn("저장").first(), { after: 1500 });
  const productId = page.url().match(/products\/([^/]+)\//)?.[1];

  // 5. 예약 기간·가격
  await cap("예약 기간·가격", "기간마다 중량별 가격과 판매 박스 수를\n정해요. 일찍 예약할수록 싸게.", "FEAT-04 · R-04");
  await go(`${producerUrl}/products/${productId}/stages`);
  // 날짜 칸은 한 번에 넣는다(한 글자씩 치면 중간값 '2'가 잘못된 날짜라 앱이 멈춤 — 별도 이슈)
  await tap(page.getByLabel("예약 종료일").first(), { after: 200 });
  await page.getByLabel("예약 종료일").first().fill("2026-11-15");
  await wait(600);
  const prices = [["25000", "45000"], ["28000", "50000"]];
  const fillStage = async (i) => {
    for (const [j, w] of ["5kg", "10kg"].entries()) {
      const pr = page.getByLabel(`${w} 가격`).nth(i);
      if (await pr.count()) {
        await type(pr, prices[i][j], { after: 200 });
        await type(page.getByLabel(`${w} 판매 물량`).nth(i), "30", { after: 200 });
      }
    }
  };
  await fillStage(0);
  await tap(btn("＋ 예약 기간 추가"));
  await fillStage(1);
  await tap(btn("예약 기간 저장"), { after: 1500 });

  // 6. 공급 물량 신청
  await cap("공급 물량 신청", "공급할 총중량을 신청해요.\n운영자가 승인하면 판매가 열려요.", "FEAT-04 · AC-04-8");
  await go(`${producerUrl}/products/${productId}/edit`);
  await tap(btn("공급 물량 신청"), { after: 1500 });
  await type(page.getByLabel("신청 후 총 공급 물량 (kg)"), "500");
  await tap(btn("공급 물량 승인 요청").last(), { after: 1000 });
  await tap(btn("확인", { exact: true }), { after: 2000 });

  // 7. 운영자 승인(관리 API · Swagger UI)
  const tokenRes = await page.request.post(`${apiUrl}/api/auth/test-login`, { data: { userId: "u-kang", app: "producer" } }).catch(() => null);
  const producerToken = tokenRes?.ok() ? (await tokenRes.json()).accessToken : null;
  const list = await page.request.get(`${apiUrl}/api/products/${productId}/capacity-requests?limit=1`, { headers: producerToken ? { Authorization: `Bearer ${producerToken}` } : {} });
  const listed = await list.json();
  const reqItem = listed.items?.[0] ?? listed[0];
  if (!reqItem) throw new Error("capacity request not found: " + JSON.stringify(listed).slice(0, 200));
  await cap("운영자 승인 · Swagger UI", "I1 운영자 화면은 관리 API(Swagger UI)예요.\n운영자 토큰으로 인증하고\n공급 물량 신청을 승인해요.", "ADR 0008 · /admin");
  // Swagger UI에는 Authorize 단추가 없어(보안 스킴 미등록) 실제 관리 API 호출과 응답을 콘솔 화면으로 보여 준다
  const approveUrl = `${apiUrl}/admin/products/${productId}/capacity-requests/${reqItem.requestId}/approve`;
  const res = await page.request.post(approveUrl, {
    headers: { Authorization: `Bearer ${adminToken}`, "Idempotency-Key": `demo-${Date.now()}` },
    data: { version: reqItem.version },
  });
  const shown = { status: res.status(), body: await res.json() };
  const cmd = `curl -X POST "${approveUrl}" \\\n  -H "Authorization: Bearer $FARMCLUB_ADMIN_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"version": ${reqItem.version}}'`;
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#F5F5F3;font-family:Pretendard,-apple-system,sans-serif">
    <div style="position:absolute;left:400px;top:40px;width:820px;height:720px;background:#111;border-radius:12px;color:#e8e8e6;font:14px/1.6 ui-monospace,Menlo,monospace;padding:24px;box-sizing:border-box;overflow:hidden">
      <div style="color:#8a8a86;margin-bottom:12px">운영자 · 관리 API (I1 운영자 화면 대신, ADR 0008)</div>
      <pre id="c" style="margin:0;white-space:pre-wrap;color:#fff"></pre>
      <pre id="r" style="margin:16px 0 0;white-space:pre-wrap;color:#7fd6a8"></pre>
    </div></body>`);
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;left:28px;top:40px;width:330px;font-family:Pretendard,-apple-system,sans-serif;color:#111";
    d.innerHTML = '<div style="font-size:15px;font-weight:600;color:#C94F0C;margin-bottom:12px">farmclub 생산자 앱</div><div style="font-size:26px;font-weight:700;letter-spacing:-.02em;margin-bottom:10px">운영자 승인</div><div style="font-size:16px;line-height:1.55;color:#333">I1 운영자 화면은 관리 API예요.<br>운영자 토큰으로 공급 물량 신청을<br>승인하면(HTTP 200, APPROVED)<br>판매가 열려요.</div><div style="margin-top:12px;font-size:13px;color:#6B6B6B">ADR 0008 · /admin</div>';
    document.body.appendChild(d);
  });
  await page.evaluate(async ({ cmd, out }) => {
    const c = document.getElementById("c");
    for (const ch of "$ " + cmd) {
      c.textContent += ch;
      await new Promise((r) => setTimeout(r, 12));
    }
    await new Promise((r) => setTimeout(r, 700));
    document.getElementById("r").textContent = out;
  }, { cmd, out: `HTTP ${shown.status}\n` + JSON.stringify(shown.body, null, 2) });
  await wait(3500);

  // 8. 판매 시작 확인
  await cap("판매 시작", "승인되면 판매 한도가 열리고\n소비자 앱에 예약 상품으로 보여요.", "FEAT-04 · FEAT-08");
  await go(`${producerUrl}/products/${productId}/sales`);
  await scroll(400);
  await go(`${producerUrl}/products`);
  await wait(1500);

  // 9. 소식 올리기
  await cap("소식 올리기", "밭 소식을 사진과 함께 팔로워에게 올려요.\n소비자는 좋아요와 비공개 댓글을 남겨요.", "FEAT-12 · SCR-27");
  await go(`${producerUrl}/broadcast/new`);
  await type(page.getByLabel("소식 내용"), "오늘 아침 당도 다시 쟀어요. 11.9브릭스!\n12월 초 수확 예정이에요. 예약해 주신 분들 감사합니다.");
  await tap(btn("올리기"), { after: 2000 });
  await scroll(500);

  // 10. 채팅 답변
  await cap("1:1 채팅 답변", "AI가 넘긴 질문만 '답변 필요'에 모여요.\n농가가 직접 답해요.", "FEAT-13 · FEAT-14 · SCR-28");
  await go(`${producerUrl}/chats`);
  await tap(page.getByRole("tab", { name: "1:1 채팅" }).or(btn("1:1 채팅")).first(), { after: 900 });
  const need = page.getByRole("tab", { name: /답변 필요/ }).or(btn(/답변 필요/)).first();
  if (await need.isVisible()) await tap(need, { after: 900 });
  await tap(page.getByRole("button", { name: /○○/ }).first(), { after: 1500 });
  await type(page.getByRole("textbox").last(), "네, 선물 포장 가능해요. 주문 메모에 남겨 주세요!");
  await tap(btn(/전송|보내기/).last(), { after: 1800 });

  // 11. 출하
  await cap("출하 처리", "수확을 시작하고 송장 번호를 넣어\n출하로 바꿔요. 소비자 주문 상태도\n함께 바뀌어요.", "FEAT-05 · SCR-29");
  await go(`${producerUrl}/ship`);
  await tap(btn("수확 시작").first());
  await tap(btn("수확 시작").last(), { after: 1500 });
  await tap(page.getByRole("button", { name: /택배사·송장 번호 넣기/ }).first(), { after: 1000 });
  await tap(page.getByRole("radio", { name: "CJ대한통운" }));
  await type(page.getByRole("textbox", { name: "송장 번호", exact: true }), "684512309871");
  await tap(btn("저장", { exact: true }), { after: 1200 });
  await tap(btn("1건 출하로 바꾸기").first());
  await tap(btn("1건 출하로 바꾸기").last(), { after: 2000 });
  await cap("끝", "생산자 앱: 가입 신청 → 현황 → AI 상품 초안\n→ 기간·가격 → 공급 물량 신청 → 운영자 승인\n→ 소식 올리기 → 채팅 답변 → 출하");
  await wait(2500);
} catch (e) {
  await page.screenshot({ path: "demo/.raw/producer-fail.png" });
  console.error("FAILED at", page.url(), e.message.split("\n")[0]);
  console.error((await page.evaluate(() => [...document.querySelectorAll("[role=button],button,a,[role=tab],[role=radio],input,textarea")].map((x) => `${x.tagName}:${(x.getAttribute("aria-label") || x.getAttribute("placeholder") || x.textContent || "").trim().slice(0, 25)}`))).join(" | ").slice(0, 1800));
  process.exitCode = 1;
} finally {
  console.log(await r.finish("demo/.raw/producer.webm"));
}
