// DEV-356: 첫 예약 UX 승인안(DEV-268 ④⑤⑥)과 로그인 로고 배치(DEV-311 결정 ⑤).
// 지금 화면의 정보·입력·동의 항목은 빠지지 않는다(11/16 결정). 승인된 예외는 입금 안내의 중복 ‘입금액’ 줄 하나.
import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { consumerUrl, monitor } from "./helpers";

const CONSENTS = [
  "받는 시기 (필수)",
  "지연 시 환불 (필수)",
  "흉작·수량 부족 (필수)",
  "취소·반품 조건 (필수)",
  "개인정보 제3자 제공 (판매자) (필수)",
];

async function gateFromProduct(page: Page) {
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  await page.getByRole("button", { name: "더하기" }).click();
  await page.getByRole("button", { name: "주문서로" }).click();
}

/** 받는 곳을 채우고(저장 배송지가 없을 때만) 모두 동의 */
async function fillCheckout(page: Page) {
  const add = page.getByRole("button", { name: "받는 사람과 주소 입력" });
  const other = page.getByRole("button", { name: "받는 곳 변경" });
  await expect(add.or(other)).toBeVisible();
  if (await add.isVisible()) {
    await add.click();
    await page.getByLabel("받는 사람").fill("DEV356 구매자");
    await page.getByLabel("연락처").fill("010-1234-5678");
    await page.getByLabel("우편번호", { exact: true }).fill("04001");
    await page.getByRole("textbox", { name: "주소", exact: true }).fill("서울 마포구 월드컵북로 12");
    await page.getByLabel("상세 주소").fill("302호");
    await page.getByRole("button", { name: "이 주소로 받기" }).click();
  }
  await page.getByRole("checkbox", { name: "모두 동의해요" }).click();
}

/** 주문서에 남아야 하는 항목(11/16 누락 금지) */
async function expectCheckoutKeepsEverything(page: Page) {
  await expect(page.getByText("테스트 서비스예요 · 실제 입금·배송은 없어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "옵션·수량 변경" })).toBeVisible();
  await expect(page.getByRole("button", { name: "받는 곳 변경" })).toBeVisible();
  await expect(page.getByRole("button", { name: /배송 메모/ })).toBeVisible();
  await expect(page.getByText("상품 금액", { exact: true })).toBeVisible();
  await expect(page.getByText("배송비", { exact: true })).toBeVisible();
  await expect(page.getByText("총 입금액", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "모두 동의해요" })).toBeVisible();
  for (const c of CONSENTS) await expect(page.getByRole("checkbox", { name: c })).toBeAttached();
  await expect(page.getByText("농가 계좌로 직접 입금해요. 24시간 안에 입금하지 않으면 자동 취소돼요.")).toBeAttached();
  await expect(page.getByText(/farmclub은 통신판매중개자이고/)).toBeAttached();
  await expect(page.getByRole("link", { name: "이용약관" })).toBeAttached();
  await expect(page.getByRole("link", { name: "개인정보 처리방침" })).toBeAttached();
}

test("DEV-356 AC-01-21 AC-01-12: reserve gate shows the chosen option and login continues the reservation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  await gateFromProduct(page);
  await expect(page.getByText("로그인하고 예약해요")).toBeVisible();
  const summary = page.getByTestId("gate-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/하우스 감귤 \S+ × 2/);
  await expect(summary).toContainText("강씨네 귤밭");
  await expect(summary).toContainText(/[\d,]+원/);
  // 배송비를 뺀 금액이라 ‘상품 금액’ 라벨을 붙인다
  await expect(summary).toContainText("상품 금액");
  await expect(page.getByText("로그인하면 고른 옵션 그대로 주문서로 가요.")).toBeVisible();
  await page.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(page).toHaveURL(/\/login\?.*from=reserve/);
  await expect(page.getByRole("heading", { name: /로그인하고\s*예약을 이어 가요/ })).toBeVisible();
  const logo = page.getByTestId("brand-logo-full");
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(logo).toHaveCSS("width", "150px");
  // 제목은 두 줄 그대로(로고 150 옆에서 셋째 줄로 넘지 않음, DEV-311 조정 다)
  const heading = page.getByRole("heading", { name: /로그인하고\s*예약을 이어 가요/ });
  const lineHeight = parseFloat(await heading.evaluate((el) => getComputedStyle(el).lineHeight));
  expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(lineHeight * 2 + 1);
  await page.getByRole("button", { name: "김민지로 로그인" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house\?optionId=opt-\w+&quantity=2/);
  assertClean();
});

test("DEV-356 AC-01-21: gates other than reserve keep their sheet body and show no summary", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "채팅", exact: true }).click();
  await expect(page.getByText("로그인하고 물어봐요")).toBeVisible();
  await expect(
    page.getByText("팔로우·예약·채팅은 로그인이 필요해요. 로그인하면 지금 보던 화면으로 돌아와요."),
  ).toBeVisible();
  await expect(page.getByTestId("gate-summary")).toHaveCount(0);
  await expect(page.getByText("로그인하면 고른 옵션 그대로 주문서로 가요.")).toHaveCount(0);
  assertClean();
});

test("DEV-356 AC-01-21: login opened directly keeps its title and still shows the logo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  await page.goto(`${consumerUrl}/login`);
  await expect(page.getByRole("heading", { name: /로그인하고\s*계속해요/ })).toBeVisible();
  await expect(page.getByText("예약을 이어 가요")).toHaveCount(0);
  await expect(page.getByTestId("brand-logo-full")).toBeVisible();
  assertClean();
});

test("DEV-356 AC-09-11 AC-08-10: deposit shows the amount once, keeps the deadline row, and back shows the placed reservation", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  await gateFromProduct(page);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: "김민지로 로그인" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  await fillCheckout(page);
  await expectCheckoutKeepsEverything(page);
  // 버튼 위 한 줄(UX ⑥)
  await expect(page.getByText("누르면 농가 계좌를 알려 드려요 · 24시간 안에 입금")).toBeVisible();
  // 예약 전에는 ‘이미 만든 예약’ 상자와 ‘잡아 뒀어요’가 없다
  await expect(page.getByText("이미 만든 예약이 있어요")).toHaveCount(0);
  await expect(page.getByText("지금 예약가로 잡아 뒀어요")).toHaveCount(0);
  await page.getByRole("button", { name: /예약하기$/ }).click();

  // 입금 안내(SCR-11)
  await expect(page).toHaveURL(/\/checkout\/p-house\/pay/);
  await expect(page.getByText("입금할 금액", { exact: true })).toBeVisible();
  // 입금자명은 짧은 입금 코드(닉네임 앞 3글자 + 숫자, DEV-342). 없는 옛 주문만 주문 번호
  const depositor = (
    (await page.getByText(/^([가-힣A-Za-z]{1,3}\d{2,3}|FC-[0-9A-Z-]+)$/).first().textContent()) ?? ""
  ).trim();
  expect(depositor).toMatch(/^([가-힣A-Za-z]{1,3}\d{2,3}|FC-)/);
  // 금액은 큰 숫자 한 번 + 복사, ‘입금액’ 줄은 없다
  await expect(page.getByRole("button", { name: "입금할 금액 복사" })).toBeVisible();
  await expect(page.getByText("입금액", { exact: true })).toHaveCount(0);
  // 표는 계좌번호·예금주·입금자명·입금 기한(기한은 입금자명 아래 그대로)
  for (const k of ["계좌번호", "예금주", "입금자명", "입금 기한"])
    await expect(page.getByText(k, { exact: true })).toBeVisible();
  const nameBox = await page.getByText("입금자명", { exact: true }).boundingBox();
  const dueBox = await page.getByText("입금 기한", { exact: true }).boundingBox();
  expect(dueBox!.y).toBeGreaterThan(nameBox!.y);
  // 입금자명 안내 상자 두 문장
  await expect(page.getByText(new RegExp(`받는 분 통장 표시를 ${depositor}(로|으로) 바꿔 보내 주세요`))).toBeVisible();
  await expect(page.getByText("농가가 이 이름으로 입금을 찾아요. 이름이 다르면 확인이 늦어질 수 있어요.")).toBeVisible();
  // 판매자·중개자·구매안전서비스 고지와 하단 두 버튼은 그대로
  await expect(page.getByText("판매자", { exact: true })).toBeAttached();
  await expect(page.getByText("farmclub은 통신판매중개자예요")).toBeAttached();
  await expect(page.getByText(/구매안전서비스\(은행 에스크로이체\)/)).toBeAttached();
  await expect(page.getByRole("button", { name: "입금을 마쳤어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "나중에 입금할게요" })).toBeVisible();

  // 뒤로 → 주문서: 이미 만든 예약(주문 번호·상태·기한)과 기존 문장, ‘입금 안내 보기’
  await page.goBack();
  await expect(page).toHaveURL(/\/checkout\/p-house\?/);
  await expect(page.getByText("이미 만든 예약이 있어요")).toBeVisible();
  // 첫 줄은 주문 번호(입금자명과 따로, DEV-342)
  await expect(page.getByText(/FC-\d{4}-\d{4} · 입금 대기 · .+까지/)).toBeVisible();
  await expect(page.getByText(/내용을 바꾸려면 기존 예약을 취소하고 다시 예약해 주세요/)).toBeVisible();
  await expect(page.getByText("지금 예약가로 잡아 뒀어요")).toBeVisible();
  await expectCheckoutKeepsEverything(page);
  // 이미 만든 예약이면 버튼 위 ‘24시간 안에 입금’ 줄은 없다(기한이 이미 흐르는 중)
  await expect(page.getByText("누르면 농가 계좌를 알려 드려요 · 24시간 안에 입금")).toHaveCount(0);
  // 수량을 바꾸면 잡지 않은 수량을 잡았다고 하지 않는다(상자는 그대로), 되돌리면 다시 보인다
  await page.getByRole("button", { name: "옵션·수량 변경" }).click();
  await page.getByRole("button", { name: "더하기" }).click();
  await page.getByRole("button", { name: "바꾸기" }).click();
  await expect(page.getByText(/하우스 감귤 \S+ × 3/).first()).toBeVisible();
  await expect(page.getByText("지금 예약가로 잡아 뒀어요")).toHaveCount(0);
  await expect(page.getByText("이미 만든 예약이 있어요")).toBeVisible();
  await page.getByRole("button", { name: "옵션·수량 변경" }).click();
  await page.getByRole("button", { name: "빼기" }).click();
  await page.getByRole("button", { name: "바꾸기" }).click();
  await expect(page.getByText("지금 예약가로 잡아 뒀어요")).toBeVisible();
  await page.getByRole("button", { name: "입금 안내 보기" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house\/pay/);
  // 스택에 남은 앞 입금 안내는 숨겨져 있어 보이는 것만 본다
  await expect(page.locator(`:text-is("${depositor}"):visible`).first()).toBeVisible();

  // 같은 카드를 쓰는 주문 완료(SCR-12)는 ‘입금액’ 줄을 그대로 둔다
  await page.getByRole("button", { name: "나중에 입금할게요" }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+\/done/);
  await expect(page.getByText("입금액", { exact: true })).toBeVisible();
  assertClean();
});
