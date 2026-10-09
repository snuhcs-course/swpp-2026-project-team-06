// Consumer app demo (Iteration 1). Run against `npm run demo` (fresh seed), then:
//   node demo/record/consumer.mjs   → demo/.raw/consumer.webm
import { consumerUrl, startRecording } from "./lib.mjs";

const r = await startRecording("consumer", "farmclub 소비자 앱");
const { page, cap, go, tap, type, scroll, wait } = r;
const btn = (name, opts = {}) => page.getByRole("button", { name, ...opts });

try {
  // 1. 발견(로그인 전)
  await go(consumerUrl);
  await cap("발견 홈", "로그인 없이 둘러봐요.\n이번 시즌 하이라이트, 마감 임박 상품,\n농가 소식을 한 화면에서 봐요.", "FEAT-06 · SCR-01");
  await scroll(700);
  await scroll(700);
  await scroll(-1400, { steps: 6 });

  // 2. 농가 페이지 → 공개 소식방
  await cap("농가 페이지", "농가 소개, 판매 상품, 소식방 입구가\n한곳에 있어요.", "FEAT-07 · SCR-03");
  await tap(page.getByRole("link").filter({ hasText: "강씨네 귤밭" }).last());
  await scroll(500);
  await scroll(-500, { steps: 4 });
  await cap("공개 소식방", "농가가 올리는 재배 소식(사진·당도)을\n누구나 볼 수 있어요.", "FEAT-12");
  await tap(btn("소식방 입장"));
  await scroll(600);
  await wait(800);

  // 3. 로그인 → 상품 상세
  await cap("테스트 계정 로그인", "I1은 Mock 로그인이에요.\n시드 테스트 계정을 고르면\n서버가 JWT를 발급해요.", "SCR-05");
  await go(`${consumerUrl}/login?next=%2Fproducts%2Fp-house`);
  await tap(page.getByRole("radio").filter({ hasText: "김민지" }));
  await tap(btn(/로그인$/), { after: 2000 });
  await cap("상품 상세 · 기간별 가격", "지금 예약하면 내는 가격, 다음 기간 가격,\n도착 예정 시기를 보여 줘요.\n일찍 예약할수록 싸요.", "FEAT-08 · SCR-04");
  if (!page.url().includes("/products/p-house")) await go(`${consumerUrl}/products/p-house`);
  await scroll(600);
  await scroll(-600, { steps: 4 });
  await tap(btn("예약하기"));
  await tap(btn("주문서로"), { after: 1500 });
  await page.waitForURL(/\/checkout\//, { timeout: 10000 });

  // 4. 주문서 → Mock 결제
  await cap("주문서", "받는 사람·주소를 넣고 약관에 동의해요.\n가격은 주문한 순간의 기간 가격으로\n고정돼요.", "FEAT-09 · SCR-10");
  const empty = btn("받는 사람과 주소 입력");
  if (await empty.isVisible()) await tap(empty);
  else {
    await tap(btn("다른 배송지"));
    await tap(btn("새 주소 입력"));
  }
  await type(page.getByLabel("받는 사람"), "김민지");
  await type(page.getByLabel("연락처"), "010-1234-5678");
  await type(page.getByLabel("우편번호"), "63584");
  await type(page.getByRole("textbox", { name: "주소", exact: true }), "제주특별자치도 서귀포시 중앙로 25");
  await type(page.getByLabel("상세 주소"), "101동 202호");
  await tap(btn("이 주소로 받기"));
  await tap(page.getByRole("checkbox", { name: "모두 동의해요" }));
  await tap(btn("결제하기"), { after: 1500 });
  await cap("결제(Mock)", "I1은 결제를 흉내 내요.\n실제 결제(PortOne)는 I2에서 붙여요.", "FEAT-09 · SCR-11");
  await tap(btn(/결제하기$/), { after: 2000 });
  await cap("예약 완료", "주문 번호와 도착 예정 시기를 알려 줘요.", "SCR-12");
  await wait(1500);

  // 5. 내 주문 → 주문 상세 → 출하 전 취소
  await cap("내 주문", "확정·미확정·취소 탭으로 나눠 보여 줘요.\n방금 한 예약이 맨 위에 있어요.", "FEAT-10 · SCR-13");
  await tap(btn("주문 내역"), { after: 1500 });
  await tap(page.getByRole("tab", { name: /미확정/ }).first(), { after: 1200 });
  await tap(page.getByRole("button").filter({ hasText: "하우스 감귤" }).first().or(page.getByRole("link").filter({ hasText: "하우스 감귤" }).first()), { after: 1500 });
  await cap("출하 전 예약 취소", "출하 전까지는 직접 취소할 수 있어요.\n물량은 다시 판매 가능 수량으로 돌아가요.", "FEAT-10 · R-10");
  await scroll(500);
  await tap(btn("예약 취소하기"));
  const confirm = page.getByRole("button", { name: /취소하기|확인|예약 취소/ }).last();
  await tap(confirm, { after: 1800 });
  await scroll(-500, { steps: 4 });

  // 6. 팔로우
  await cap("농가 팔로우", "팔로우하면 소식방에서 비공개 댓글을\n남기고, 홈에 그 농가 소식이 떠요.", "FEAT-11");
  await go(`${consumerUrl}/farms/f-kang`);
  const follow = btn("팔로우", { exact: true });
  if (await follow.isVisible()) await tap(follow, { after: 1500 });
  else await wait(1500);

  // 7. 소식방: 좋아요·댓글
  await cap("소식방 · 좋아요와 댓글", "소식에 좋아요를 누르고 농가에 댓글을 남겨요.\n댓글은 나와 농가만 봐요.", "FEAT-12 · FEAT-15");
  await go(`${consumerUrl}/news/f-kang`);
  await tap(page.getByRole("button", { name: /좋아요/ }).first(), { after: 1000 });
  const reply = page.getByRole("textbox", { name: "농가에 답장" });
  if (await reply.isVisible()) {
    await type(reply, "사진 보니 기대돼요! 수확 날짜 알려 주세요");
    await tap(page.getByRole("button", { name: /전송|보내기/ }).last(), { after: 1500 });
  }

  // 8. 1:1 채팅 + AI 응답
  await cap("1:1 채팅 · AI 응답", "배송·보관처럼 자주 묻는 질문은 AI가\n농가 정보로 바로 답하고, 농가 판단이\n필요하면 농가에게 넘겨요.", "FEAT-13 · FEAT-14");
  await go(`${consumerUrl}/chats/f-halla`);
  await type(page.getByRole("textbox").last(), "택배는 언제 도착하나요?");
  await tap(page.getByRole("button", { name: /전송|보내기/ }).last(), { after: 4000 });
  await type(page.getByRole("textbox").last(), "선물용으로 포장 따로 해 주실 수 있나요?");
  await tap(page.getByRole("button", { name: /전송|보내기/ }).last(), { after: 4000 });
  await cap("끝", "소비자 앱: 발견 → 농가·소식방 → 상품 상세\n→ 예약·결제(Mock) → 주문 내역·취소\n→ 팔로우·좋아요·댓글 → 1:1 채팅(AI)");
  await wait(2500);
} catch (e) {
  await page.screenshot({ path: "demo/.raw/consumer-fail.png" });
  console.error("FAILED at", page.url(), e.message.split("\n")[0]);
  console.error((await page.evaluate(() => [...document.querySelectorAll("[role=button],button,a,[role=tab],input,textarea")].map((x) => `${x.tagName}:${(x.getAttribute("aria-label") || x.getAttribute("placeholder") || x.textContent || "").trim().slice(0, 25)}`))).join(" | ").slice(0, 1500));
  process.exitCode = 1;
} finally {
  console.log(await r.finish("demo/.raw/consumer.webm"));
}
