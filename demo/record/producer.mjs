// Producer app demo (Iteration 1). Run against `npm run demo` (fresh seed), then:
//   FARMCLUB_ADMIN_TOKEN=<token printed by npm run demo> node demo/record/producer.mjs → demo/.raw/producer.webm
// The AI product draft uses Claude when ANTHROPIC_API_KEY is set in server/.env; otherwise the
// app shows its documented fallback (AC-03-3) and the script fills the fields by hand.
import { apiUrl, producerUrl, startRecording } from "./lib.mjs";

// 입금 확인 장면용: 녹화 전에 소비자(이서준) 계정으로 입금 대기 주문을 하나 만든다(FEAT-09)
async function seedAwaitingDeposit(request) {
  const login = await request.post(`${apiUrl}/api/auth/test-login`, { data: { userId: "u-seojun", app: "consumer" } });
  const token = (await login.json()).accessToken;
  const h = (k) => ({ Authorization: `Bearer ${token}`, "Idempotency-Key": `demo-${k}-${Date.now()}` });
  const order = await (
    await request.post(`${apiUrl}/api/orders`, {
      headers: h("order"),
      data: { productId: "p-house", optionId: "opt-5", quantity: 1, recipientName: "이서준", recipientPhone: "010-3333-4444", postalCode: "04001", address: "서울 마포구 월드컵북로 12", addressDetail: "302호", consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true }, consentVersion: "policy-2026-10-06" },
    })
  ).json();
  if (!order.orderId) throw new Error("order seed failed: " + JSON.stringify(order).slice(0, 300));
  await request.post(`${apiUrl}/api/orders/${order.orderId}/deposit`, { headers: h("deposit") });
  await request.post(`${apiUrl}/api/orders/${order.orderId}/deposit-reported`, { headers: h("reported") });
  return order;
}

const r = await startRecording("producer", "farmclub 생산자 앱");
const { page, cap, go, tap, type, scroll, wait } = r;
const seeded = await seedAwaitingDeposit(page.request);
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
    await cap("직접 입력", "AI가 실패하면 붙여넣은 글은 그대로 두고\n직접 입력으로 이어 가요.", "FEAT-03 · AC-03-3");
    await tap(btn("직접 입력하기"), { after: 1500 });
    await type(page.getByLabel("상품명"), "서귀포 노지 감귤");
    await type(page.getByLabel("예상 당도"), "11.5");
  } else {
    await scroll(500);
    await tap(btn("편집으로"), { after: 2000 });
  }

  // 4. 빈 칸 채우기 → 저장
  await cap("빈 칸 채우기", "AI가 못 채운 품종·등급·받는 시기·\n환불 기한을 정하고 저장해요.", "FEAT-03 · SCR-25");
  const variety = page.getByLabel("품종");
  if (!(await variety.inputValue().catch(() => ""))) await type(variety, "온주밀감");
  const weights = btn("중량 옵션: 비어 있음");
  if (await weights.isVisible()) {
    await tap(weights, { after: 800 });
    await tap(page.getByText("5kg", { exact: true }).last(), { after: 300 });
    await tap(page.getByText("10kg", { exact: true }).last(), { after: 300 });
    await tap(btn("정하기"));
  }
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

  await cap("운영자 승인 대기", "운영자가 관리자 페이지에서 신청을\n승인하면 판매가 열려요.\n(관리자 페이지 영상에서 이어져요)", "FEAT-04 · DEV-87");
  await scroll(500);
  await wait(1200);

  // 8. 입금 확인(FEAT-09)
  await cap("입금 확인", "소비자가 농가 계좌로 입금하면\n통장과 대조해 '입금 승인'을 눌러요.\n그러면 예약이 완료돼요.", "FEAT-09 · SCR-29");
  await go(`${producerUrl}/ship`);
  await tap(page.getByRole("tab", { name: /입금 대기/ }).or(btn(/입금 대기/)).first(), { after: 1200 });
  await tap(btn(/입금 승인$/).first(), { after: 1200 });
  const confirmDeposit = btn(/^확인$|^입금 승인$|승인하기/).last();
  if (await confirmDeposit.isVisible()) await tap(confirmDeposit, { after: 1800 });
  await wait(1200);

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
  await cap("출하 처리", "택배사와 송장 번호를 넣고\n출하로 바꿔요. 소비자 주문 상태도\n함께 바뀌어요.", "FEAT-05 · SCR-29");
  await go(`${producerUrl}/ship`);
  await tap(btn(/^FC-1006-0040/).first(), { after: 1000 });
  await tap(page.getByText("CJ대한통운", { exact: true }).last(), { after: 400 });
  await type(page.getByRole("textbox", { name: "송장 번호", exact: true }), "684512309871");
  await tap(btn("저장", { exact: true }), { after: 1500 });
  await tap(btn(/출하로 바꾸기/).first(), { after: 1000 });
  const shipOk = btn(/출하로 바꾸기|^확인$/).last();
  if (await shipOk.isVisible()) await tap(shipOk, { after: 2000 });
  await cap("끝", "생산자 앱: 가입 신청 → 현황 → AI 상품 초안\n→ 기간·가격 → 공급 물량 신청 → 입금 승인\n→ 소식 올리기 → 채팅 답변 → 출하");
  await wait(2500);
} catch (e) {
  await page.screenshot({ path: "demo/.raw/producer-fail.png" });
  console.error("FAILED at", page.url(), e.message.split("\n")[0]);
  console.error((await page.evaluate(() => [...document.querySelectorAll("[role=button],button,a,[role=tab],[role=radio],input,textarea")].map((x) => `${x.tagName}:${(x.getAttribute("aria-label") || x.getAttribute("placeholder") || x.textContent || "").trim().slice(0, 25)}`))).join(" | ").slice(0, 1800));
  process.exitCode = 1;
} finally {
  console.log(await r.finish("demo/.raw/producer.webm"));
}
