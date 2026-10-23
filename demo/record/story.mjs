// farmclub 전체 이야기 데모(한 농가·한 소비자). 구간마다 따로 녹화하고 나중에 이어 붙인다.
//   node demo/record/story.mjs <구간>   → demo/.raw/story/<구간>.webm
// 구간 순서: p1 a1 p2 a2 c1 p3 c2 p4 c3 (출하는 앱에 '예약 → 출하 준비' 화면이 없어 뺌, FEAT-17 AC-17-3)
//   p = 생산자 앱, a = 관리자 페이지, c = 소비자 앱
// 로컬: 테스트 계정 로그인. 운영: DEMO_KAKAO=1 + DEMO_PROFILE(카카오·관리자 로그인을 미리 해 둔 브라우저 프로필)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";

import { apiUrl, consumerUrl, producerUrl, startRecording } from "./lib.mjs";

const adminUrl = process.env.FARMCLUB_ADMIN_URL ?? "http://127.0.0.1:8090";
const KAKAO = process.env.DEMO_KAKAO === "1";
const STATE = "demo/.raw/story/state.json";
mkdirSync("demo/.raw/story", { recursive: true });
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

// 데모 농가·상품(운영에서도 쓰므로 가상 인물·가상 계좌)
const FARM = { owner: "강영호", name: "영호네 귤밭", region: "제주 서귀포시 남원읍", crops: "노지 감귤, 천혜향", phone: "010-0000-0000" };
const ACCOUNT = { bank: "제주은행", number: "000-00-000000", holder: "강영호" };
const PRODUCT_TEXT = "[예약] 남원 노지 감귤 5kg·10kg\n올해 당도 11.5브릭스 예상, 12월 초 수확해서 바로 보내드려요.\n무료배송(도서산간 3천원 추가)";

const seg = process.argv[2];
const LABEL = { p: "생산자 앱", a: "관리자 페이지", c: "소비자 앱" }[seg?.[0]];
if (!LABEL) throw new Error("구간: p1 a1 p2 a2 c1 p3 c2 p4 c3 p5 c4");
const capPos = seg[0] === "a" ? { left: 640, top: 560, width: 600, card: true } : undefined;
const r = await startRecording(`story-${seg}`, `farmclub ${LABEL}`, capPos);
const { page, cap, go, tap, type, scroll, wait } = r;
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const btn = (name, opts = {}) => page.getByRole("button", { name, ...opts });

/** 로그인: 운영은 카카오(프로필에 카카오 세션이 있어 동의만 거침), 로컬은 테스트 계정 */
async function loginProducer(testName) {
  await go(`${producerUrl}/login`);
  if (!new URL(page.url()).pathname.startsWith("/login")) return; // 이미 로그인됨
  if (KAKAO) {
    await tap(btn("카카오로 시작하기"), { after: 1500 });
    const agree = page.getByRole("button", { name: /동의하고 계속하기|계속하기/ });
    if (await agree.isVisible().catch(() => false)) await tap(agree, { after: 1500 });
    await page.waitForURL((u) => u.host === new URL(producerUrl).host && !u.pathname.startsWith("/auth"), { timeout: 60000 });
    await wait(1500);
  } else {
    await tap(page.getByRole("radio", { name: new RegExp(testName) }).first());
    await tap(btn(/시작하기$/), { after: 2000 });
  }
}
async function loginConsumer(next) {
  await go(`${consumerUrl}/login?next=${encodeURIComponent(next)}`);
  if (!new URL(page.url()).pathname.startsWith("/login")) return; // 이미 로그인됨
  if (KAKAO) {
    await tap(page.getByRole("button", { name: /카카오/ }).first(), { after: 1500 });
    const agree = page.getByRole("button", { name: /동의하고 계속하기|계속하기/ });
    if (await agree.isVisible().catch(() => false)) await tap(agree, { after: 1500 });
    await page.waitForURL((u) => u.host === new URL(consumerUrl).host && !u.pathname.startsWith("/auth") && !u.pathname.startsWith("/login"), { timeout: 60000 });
    await wait(1500);
  } else {
    await tap(page.getByRole("radio").filter({ hasText: "김민지" }));
    await tap(btn(/로그인$/), { after: 2000 });
  }
}
async function adminHome(path) {
  await go(`${adminUrl}${path}`);
  if (page.url().includes("/login")) {
    // 로컬 관리자 페이지만 비밀번호를 넣는다. 운영은 미리 로그인해 둔 프로필을 쓴다
    if (KAKAO || !process.env.ADMIN_WEB_PASSWORD) {
      // 운영: 비밀번호는 사람이 화면에서 직접 입력한다(그 장면도 녹화된다)
      await cap("관리자 로그인", "운영자는 공용 접속 비밀번호로 로그인해요.\n승인·반려는 운영자 계정 이름으로 기록돼요.", "DEV-82·83");
      console.log(">>> 창에서 관리자 비밀번호를 입력하고 로그인해 주세요(5분 기다려요)");
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 300000 });
      await wait(1500);
      if (!page.url().includes(path)) await go(`${adminUrl}${path}`);
      return;
    }
    await type(page.locator("input[type=password]"), process.env.ADMIN_WEB_PASSWORD, { after: 300 });
    await tap(btn("로그인"), { after: 1800 });
    if (!page.url().includes(path)) await go(`${adminUrl}${path}`);
  }
}
/** 파일 고르기 창이 뜨는 단추를 눌러 사진을 올린다 */
async function upload(locator, file) {
  const chooser = page.waitForEvent("filechooser", { timeout: 8000 }).catch(() => null);
  await tap(locator, { after: 300 });
  const fc = await chooser;
  if (fc) await fc.setFiles(file);
  await wait(1800);
}
/** 관리자 카드 안의 '승인'을 두 번 눌러 확인 */
async function approveCard(text) {
  const card = page.locator("article, section, li, .card, div").filter({ hasText: text }).filter({ has: page.getByRole("button", { name: "승인", exact: true }) }).last();
  await tap(card.getByRole("button", { name: "승인", exact: true }), { after: 900 });
  await tap(page.getByRole("button", { name: /한 번 더 누르기/ }).first(), { after: 2200 });
}

const segments = {
  // 1. 생산자: 카카오로 시작해 농가 가입 신청
  async p1() {
    // 가입 장면을 찍으려면 이전 촬영의 생산자 로그인이 없어야 한다(카카오 계정 로그인은 프로필에 남겨 둔다)
    await page.goto(`${producerUrl}/login`);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await cap("카카오로 시작하기", "농가는 카카오 계정으로 시작해요.\n처음이면 농가 없는 생산자 계정이 생기고\n가입 신청 화면으로 가요.", "FEAT-01 · SCR-19");
    await loginProducer("강영호|신규 생산자");
    await cap("농가 가입 신청", "대표자·농가 이름·지역·작물·연락처를 적고\n입점 정책에 동의해 신청해요.", "FEAT-01 · SCR-20");
    for (const [label, v] of [["대표자 이름", FARM.owner], ["농가 이름", FARM.name], ["지역", FARM.region], ["주로 키우는 것", FARM.crops], ["연락처", FARM.phone]]) await type(page.getByLabel(label), v, { after: 200 });
    await tap(page.getByLabel("입점 정책에 동의해요"));
    await tap(btn("신청하기"), { after: 2200 });
    await cap("승인 대기", "farmclub이 전화·방문으로 농가인지 확인할 때까지\n기다려요. 들어올 때마다 결과를 새로 불러와요.", "FEAT-01 · SCR-21");
    await wait(2500);
  },
  // 2. 관리자: 방금 신청한 농가 승인
  async a1() {
    await adminHome("/producers");
    await cap("농가 가입 승인", `방금 신청한 '${FARM.name}'을 확인하고\n두 번 눌러 승인해요. 결정은 운영자 이름으로 남아요.`, "FEAT-01 · DEV-82·83");
    await wait(1200);
    await approveCard(FARM.name);
    await tap(btn(/^승인 \d+/), { after: 1800 });
    await wait(1200);
  },
  // 3. 생산자: 농가 준비(소개·입금 계좌·링크) → AI 상품 초안 → 기간·가격 → 공급 물량 신청
  async p2() {
    await cap("승인된 농가 · 현황", "승인되면 바로 현황으로 들어와요.\n먼저 소비자가 입금할 계좌를 등록하라고 알려 줘요.", "FEAT-14 · SCR-22");
    await loginProducer("강영호|신규 생산자");
    await wait(1800);
    await cap("농가 프로필 · 입금 계좌", "농가 소개와 입금 계좌를 정해요.\n계좌가 없으면 상품 승인을 요청할 수 없어요.", "FEAT-02 · FEAT-09");
    await go(`${producerUrl}/farm`);
    await upload(btn("사진 바꾸기"), "docs/design/assets/farmer.jpg");
    await tap(btn(/^소개 고치기/), { after: 1000 });
    await type(page.getByRole("textbox", { name: "소개" }), "남원에서 3대째 노지 감귤을 키워요. 수확 날 바로 따서 보내요.");
    await tap(btn("저장").last(), { after: 1500 });
    if (!page.url().endsWith("/farm")) await go(`${producerUrl}/farm`);
    await tap(btn(/^입금 계좌 고치기/), { after: 1000 });
    await type(page.getByRole("textbox", { name: "은행" }), ACCOUNT.bank, { after: 200 });
    await type(page.getByRole("textbox", { name: "계좌번호" }), ACCOUNT.number, { after: 200 });
    await type(page.getByRole("textbox", { name: "예금주" }), ACCOUNT.holder, { after: 200 });
    await tap(btn("저장").last(), { after: 1500 });
    if (!page.url().endsWith("/farm")) await go(`${producerUrl}/farm`);
    await cap("농가 링크 공유", "농가 링크를 복사해 단골에게 문자·카톡으로 보내요.\n누르면 소비자 앱 농가 페이지로 바로 가요.", "FEAT-19");
    state.farmLink = (await page.getByText(/\/s\/farms\//).first().innerText()).trim();
    state.farmId = state.farmLink.match(/farms\/([^/?#\s]+)/)?.[1];
    await tap(btn("복사"), { after: 1800 });

    await cap("AI 상품 초안", "밴드·카톡에 쓰던 판매 문구를 붙여넣으면\nAI가 상품 정보를 채워요.\n문구에 없는 건 '확인 필요'로 남겨요.", "FEAT-03 · SCR-24");
    // 운영 기본 진입은 자료 분석(DEV-84)이라, 붙여넣기 AI 초안 화면으로 바로 간다
    await go(`${producerUrl}/products/manual`);
    await type(page.getByLabel("카톡·밴드에 쓰던 문구"), PRODUCT_TEXT, { after: 800 });
    await tap(btn("초안 만들기"), { after: 500 });
    const ok = page.getByText("초안이 나왔어요");
    const failed = page.getByText("초안을 만들지 못했어요");
    await ok.or(failed).first().waitFor({ timeout: 40000 });
    await wait(1500);
    if (await failed.isVisible()) {
      await cap("직접 입력", "AI가 실패하면 붙여넣은 글은 그대로 두고\n직접 입력으로 이어 가요.", "FEAT-03 · AC-03-3");
      await tap(btn("직접 입력하기"), { after: 1500 });
      await type(page.getByLabel("상품명"), "남원 노지 감귤");
      await type(page.getByLabel("예상 당도"), "11.5");
    } else {
      await scroll(500);
      await tap(btn("편집으로"), { after: 2000 });
    }
    await cap("빈 칸 채우기", "AI가 못 채운 품종·중량·등급·받는 시기·\n환불 기한을 정하고 저장해요.", "FEAT-04 · SCR-25");
    await upload(btn("사진 추가").first(), "docs/design/assets/basket.jpg");
    const variety = page.getByLabel("품종");
    if (!(await variety.inputValue().catch(() => ""))) await type(variety, "온주밀감");
    const weights = btn("중량 옵션: 비어 있음");
    if (await weights.isVisible()) {
      await tap(weights, { after: 800 });
      await tap(page.getByText("5kg", { exact: true }).last(), { after: 300 });
      await tap(page.getByText("10kg", { exact: true }).last(), { after: 300 });
      await tap(btn("정하기"));
    }
    await tap(page.getByText("상", { exact: true }).first(), { after: 400 });
    const pickDec = async (...days) => {
      for (let i = 0; i < 6 && !(await page.getByText("2026년 12월").isVisible()); i++) await tap(btn("다음 달"), { after: 300 });
      for (const d of days) await tap(btn(new RegExp(`^12월 ${d}일`)), { after: 300 });
    };
    await tap(btn(/^받는 시기/), { after: 800 });
    await pickDec(10, 20);
    await tap(btn("이 기간으로"));
    await tap(btn(/^이 날까지 못 보내면 전액 환불/), { after: 800 });
    await pickDec(31);
    await tap(btn("이 날로"));
    await tap(btn("저장").first(), { after: 1500 });
    state.productId = page.url().match(/products\/([^/]+)\//)?.[1];
    state.productName = await page.getByLabel("상품명").inputValue();
    save();

    await cap("예약 기간 · 가격", "기간마다 중량별 가격과 판매 박스 수를 정해요.\n일찍 예약할수록 싸게 정해요.", "FEAT-05 · R-04");
    await go(`${producerUrl}/products/${state.productId}/stages`);
    await tap(page.getByLabel("예약 종료일").first(), { after: 200 });
    await page.getByLabel("예약 종료일").first().fill("2026-11-15"); // 한 글자씩 치면 중간값이 잘못된 날짜라 앱이 멈춘다
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

    await cap("공급 물량 신청", "공급할 총중량을 신청해요.\n운영자가 승인하면 판매가 열려요.", "FEAT-04 · AC-04-8");
    await go(`${producerUrl}/products/${state.productId}/edit`);
    await tap(btn("공급 물량 신청"), { after: 1500 });
    await type(page.getByLabel("신청 후 총 공급 물량 (kg)"), "500");
    await tap(btn("공급 물량 승인 요청").last(), { after: 1000 });
    await tap(btn("확인", { exact: true }), { after: 2200 });
    await wait(1200);
  },
  // 4. 관리자: 그 상품의 공급 물량 승인 → 판매 중
  async a2() {
    await adminHome("/capacity");
    await cap("공급 물량 승인", `'${state.productName}'의 첫 판매 신청이에요.\n신청량 그대로 승인하면 상품이 판매 중이 되고\n소비자 앱에 보여요.`, "FEAT-04 · DEV-87");
    await wait(1200);
    await approveCard(state.productName);
    await tap(btn(/^승인 \d+/), { after: 2000 });
    await wait(1200);
  },
  // 5. 소비자: 로그인 → 농가 링크·검색으로 찾기 → 팔로우 → 상품 상세 → 예약 → 입금 안내
  async c1() {
    await cap("소비자 · 카카오 로그인", "예약·팔로우·채팅을 할 때 카카오로 로그인해요.\n처음이면 닉네임·이름·연락처와 필수 동의를 받아요.", "FEAT-01");
    await loginConsumer("/");
    await cap("농가·상품 검색", "농가 이름·품종·지역으로 찾아요.\n방금 판매를 시작한 농가가 바로 나와요.", "FEAT-06");
    await go(consumerUrl);
    await tap(btn("농가·상품 검색"), { after: 1000 });
    await type(page.getByRole("searchbox").or(page.getByRole("textbox")).first(), FARM.name, { after: 1500 });
    await tap(page.getByText(FARM.name).filter({ visible: true }).last(), { after: 2000 });
    await cap("농가 소식방 · 팔로우", "농가 페이지는 소식방이에요. 위에 판매 품목,\n아래에 농가 소식. 팔로우하면 홈에 소식이 떠요.", "FEAT-06 · FEAT-12");
    const follow = btn("팔로우", { exact: true });
    if (await follow.isVisible()) await tap(follow, { after: 1500 });
    await cap("상품 상세", "지금 예약 가격과 다음 기간 가격, 받는 시기,\n당도·등급을 보여 줘요.", "FEAT-07 · SCR-04");
    // 뒤에 쌓인 검색 화면에도 같은 이름이 있어 맨 위(마지막) 카드를 누른다
    await tap(page.getByRole("button", { name: new RegExp(`${state.productName}.*상품 상세`) }).or(page.getByText(state.productName)).last(), { after: 2000 });
    await scroll(600);
    await scroll(-600, { steps: 4 });
    await tap(btn("예약하기").last(), { after: 1200 });
    const toCheckout = btn("주문서로");
    if (await toCheckout.isVisible().catch(() => false)) await tap(toCheckout, { after: 1500 });
    await page.waitForURL(/\/checkout\//, { timeout: 15000 });
    await cap("주문서", "받는 사람·주소를 넣고 받는 시기·지연 환불·\n흉작·취소 조건에 동의해요.\n가격은 예약한 때로 고정돼요.", "FEAT-08 · SCR-10");
    const fresh = btn("받는 사람과 주소 입력");
    if (await fresh.isVisible().catch(() => false)) await tap(fresh);
    else {
      await tap(btn("다른 배송지"));
      await tap(btn("새 주소 입력"));
    }
    await type(page.getByLabel("받는 사람"), "데모 고객");
    await type(page.getByLabel("연락처"), "010-0000-0000");
    await type(page.getByLabel("우편번호"), "63584");
    await type(page.getByRole("textbox", { name: "주소", exact: true }), "제주특별자치도 서귀포시 중앙로 1");
    await type(page.getByLabel("상세 주소"), "데모동 101호");
    const saveDefault = page.getByLabel(/기본 배송지로 저장/);
    if (await saveDefault.isChecked().catch(() => false)) await tap(saveDefault, { after: 300 });
    await tap(btn("이 주소로 받기"));
    await tap(page.getByRole("checkbox", { name: "모두 동의해요" }));
    await tap(btn("예약하기").last(), { after: 1800 });
    await cap("무통장 입금 안내", "farmclub은 돈을 받지 않아요. 농가 계좌·입금액·\n입금자명(주문 번호)·기한을 보고 입금한 뒤\n'입금을 마쳤어요'를 눌러요.", "FEAT-09 · SCR-11");
    state.orderId = new URL(page.url()).searchParams.get("orderId");
    save();
    await scroll(400);
    await tap(btn("입금을 마쳤어요"), { after: 2200 });
    await wait(1500);
  },
  // 6. 생산자: 입금 승인 → 소식 올리기
  async p3() {
    await cap("입금 승인", "통장과 대조해 입금을 승인하면\n소비자의 예약이 완료돼요.", "FEAT-09 · SCR-29");
    await loginProducer("강영호|신규 생산자");
    await go(`${producerUrl}/ship?status=AWAITING_DEPOSIT`);
    await wait(1200);
    await tap(btn(/입금 승인$/).first(), { after: 1200 });
    const okDeposit = btn(/^확인$|^입금 승인$|승인하기/).last();
    if (await okDeposit.isVisible().catch(() => false)) await tap(okDeposit, { after: 1800 });
    await cap("소식 올리기", "밭 소식을 팔로워 모두에게 올려요.", "FEAT-12 · FEAT-15");
    await go(`${producerUrl}/broadcast/new`);
    await type(page.getByLabel("소식 내용"), "이번 주 착색 시작했어요! 12월 초에 수확해서 바로 보내 드릴게요.");
    await tap(btn("올리기"), { after: 2200 });
    await wait(1200);
  },
  // 7. 소비자: 예약 완료 확인 → 소식 좋아요 → 채팅(AI가 답하는 질문, 농가에 넘어가는 질문)
  async c2() {
    await cap("예약 완료", "농가가 입금을 확인해 예약이 완료됐어요.", "FEAT-10 · SCR-14");
    await loginConsumer(`/orders/${state.orderId}`);
    if (!page.url().includes(state.orderId)) await go(`${consumerUrl}/orders/${state.orderId}`);
    await wait(2000);
    await cap("소식에 좋아요", "팔로우한 농가가 올린 소식에 좋아요를 눌러요.", "FEAT-15");
    await go(`${consumerUrl}/farms/${state.farmId}`);
    await scroll(600);
    await tap(page.getByRole("button", { name: /좋아요/ }).last(), { after: 1200 });
    await cap("1:1 채팅 · AI 응답", "받는 시기처럼 등록된 정보는 AI가 바로 답하고,\n농가 판단이 필요한 질문은 농가에 넘겨요.", "FEAT-13");
    await go(`${consumerUrl}/products/${state.productId}`);
    await tap(btn("1:1 채팅").last(), { after: 2000 });
    await type(page.getByRole("textbox").last(), "배송은 언제예요?");
    await tap(page.getByRole("button", { name: /전송|보내기/ }).last(), { after: 4500 });
    await type(page.getByRole("textbox").last(), "농약은 얼마나 치세요?");
    await tap(page.getByRole("button", { name: /전송|보내기/ }).last(), { after: 4500 });
    await wait(1500);
  },
  // 8. 생산자: AI가 넘긴 질문에 답
  async p4() {
    await cap("넘어온 질문에 답하기", "AI가 넘긴 질문만 '답변 필요'에 모여요.\n농가의 답은 그 소비자에게만 보여요.", "FEAT-13 · SCR-28");
    await loginProducer("강영호|신규 생산자");
    await go(`${producerUrl}/chats`);
    await tap(page.getByRole("tab", { name: "1:1 채팅" }).or(btn("1:1 채팅")).first(), { after: 900 });
    const need = page.getByRole("tab", { name: /답변 필요/ }).or(btn(/답변 필요/)).first();
    if (await need.isVisible().catch(() => false)) await tap(need, { after: 900 });
    await tap(page.getByRole("button", { name: /농가에 전달했어요|농약/ }).first(), { after: 1500 });
    await type(page.getByRole("textbox").last(), "저농약으로 키워요. 수확 한 달 전부터는 치지 않아요.");
    await tap(btn(/전송|보내기/).last(), { after: 2000 });
  },
  // 9. 소비자: 농가 답 확인
  async c3() {
    await cap("농가의 답", "농가가 직접 남긴 답이 내 채팅에 와 있어요.\n다른 소비자에게는 보이지 않아요.", "FEAT-13");
    await loginConsumer(`/products/${state.productId}`);
    if (!page.url().includes(`/products/${state.productId}`)) await go(`${consumerUrl}/products/${state.productId}`);
    await tap(btn("1:1 채팅").last(), { after: 3000 });
    await scroll(800);
    await wait(1500);
    await cap("끝", "카카오로 시작한 농가가 승인을 받아 상품을 올리고,\n운영자가 공급 물량을 승인하자 소비자가 찾아\n예약·입금하고, 농가와 소통하는 한 흐름이에요.");
    await wait(2500);
  },
  // 10. 생산자: 출하
  async p5() {
    await cap("출하 처리", "택배를 보낸 뒤 그 주문을 골라 택배사·송장 번호를\n넣고 출하로 바꿔요.", "FEAT-17 · SCR-29");
    await loginProducer("강영호|신규 생산자");
    await go(`${producerUrl}/ship`);
    await wait(1200);
    await tap(page.getByRole("button").filter({ hasText: "데모 고객" }).first(), { after: 1000 });
    await tap(page.getByText("CJ대한통운", { exact: true }).last(), { after: 400 });
    await type(page.getByRole("textbox", { name: "송장 번호", exact: true }), "000000000000");
    await tap(btn("저장", { exact: true }), { after: 1500 });
    await tap(btn(/출하로 바꾸기/).first(), { after: 1000 });
    const shipOk = btn(/출하로 바꾸기|^확인$/).last();
    if (await shipOk.isVisible().catch(() => false)) await tap(shipOk, { after: 2000 });
  },
  // 11. 소비자: 배송 중 확인
  async c4() {
    await cap("배송 중", "주문 상세에 택배사와 송장 번호가 보여요.", "FEAT-10 · FEAT-17");
    await loginConsumer(`/orders/${state.orderId}`);
    if (!page.url().includes(state.orderId)) await go(`${consumerUrl}/orders/${state.orderId}`);
    await wait(2500);
    await cap("끝", "카카오로 시작한 농가가 승인을 받아 상품을 올리고,\n소비자가 찾아 예약·입금하고, 소통하고,\n출하까지 한 흐름이에요.");
    await wait(2500);
  },
};

try {
  await segments[seg]();
} catch (e) {
  await page.screenshot({ path: `demo/.raw/story/${seg}-fail.png` });
  console.error("FAILED", seg, "at", page.url(), e.message.split("\n").filter((l) => /intercept|FAILED|Timeout|not/.test(l)).slice(0, 4).join(" / "));
  console.error((await page.evaluate(() => [...document.querySelectorAll("[role=button],button,a,[role=tab],[role=radio],input,textarea")].map((x) => `${x.tagName}:${(x.getAttribute("aria-label") || x.getAttribute("placeholder") || x.textContent || "").trim().slice(0, 25)}`)).catch(() => [])).join(" | ").slice(0, 1600));
  process.exitCode = 1;
} finally {
  const out = await r.finish(`demo/.raw/story/${seg}.webm`);
  if (process.exitCode) renameSync(out, out.replace(/(\.\w+)$/, "-failed$1"));
  else console.log(out);
}
void apiUrl;
