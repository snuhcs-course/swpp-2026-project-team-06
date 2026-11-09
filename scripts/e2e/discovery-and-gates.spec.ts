import { expect, test } from "./fixtures";

import { consumerUrl, loginProducer, monitor, producerUrl } from "./helpers";

test("AC-06/07/15: anonymous discovery, public news, and login return", async ({
  page,
}) => {
  const assertClean = monitor(page);
  await page.goto(consumerUrl);
  await expect(page.getByRole("heading", { name: "농가 소식" })).toBeVisible();

  await page
    .getByRole("link", { name: "강씨네 귤밭 소식방에서 이어 보기" })
    .click();
  await expect(page).toHaveURL(/\/farms\/f-kang/);
  await expect(
    page.getByRole("button", { name: "강씨네 귤밭 농가 보기" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "판매 품목" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await page.goto(`${consumerUrl}/products/p-house`);
  // DEV-141: 상품정보 접기 상태가 aria-expanded로 나온다
  const info = page.getByRole("button", { name: "상품정보" });
  await expect(info).toHaveAttribute("aria-expanded", "false");
  await info.click();
  await expect(info).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "예약하기" }).click();
  await page.getByRole("button", { name: "주문서로" }).click();
  await expect(page.getByText("로그인하고 예약해요")).toBeVisible();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: "김민지로 로그인" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  assertClean();
});

test("AC-01-3: producer account gates use separate sessions", async ({
  browser,
}) => {
  const gates = [
    ["오미숙", /\/pending$/, "확인 중이에요"],
    ["박순자", /\/pending$/, "신청이 반려됐어요"],
    ["최태호", /\/suspended$/, "계정이 정지됐어요"],
    ["신규 생산자", /\/apply$/, "농가 등록 신청"],
  ] as const;
  for (const [account, url, heading] of gates) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const assertClean = monitor(page);
    await loginProducer(page, account);
    await expect(page).toHaveURL(url);
    await expect(
      page.getByText(heading, { exact: false }).first(),
    ).toBeVisible();
    assertClean();
    await context.close();
  }

  const approved = await browser.newContext();
  const approvedPage = await approved.newPage();
  const assertApprovedClean = monitor(approvedPage);
  await loginProducer(approvedPage, "강영수");
  await expect(approvedPage).toHaveURL(
    new RegExp(`${producerUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`),
  );
  await expect(approvedPage.getByText("주문·배송 현황")).toBeVisible();
  assertApprovedClean();
  await approved.close();
});

test("N-02: core discovery remains usable at supported widths", async ({
  page,
}) => {
  const assertClean = monitor(page);
  for (const width of [360, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(consumerUrl);
    await expect(page.getByRole("heading", { name: "농가 소식" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "농가·상품 검색" }),
    ).toBeVisible();
  }
  assertClean();
});

// DEV-214 (FEAT-06 E4): 목록이 있는 채 검색이 실패하면 오류 상자와 ‘이전 목록’, 다시 시도는 처음부터 받아 중복이 없다
test("AC-06-2 AC-06-7: search failure shows a notice and retry does not duplicate", async ({
  page,
}) => {
  // 첫 검색 요청만 네트워크 실패(연결 끊김 문구). 브라우저가 남기는 리소스 실패 로그는 허용
  const assertClean = monitor(page, [/Failed to load resource|ERR_FAILED/]);
  let injected = false;
  await page.route(/\/api\/farms\?.*q=/, async (route) => {
    if (!injected) {
      injected = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto(`${consumerUrl}/farms`);
  await expect(page.getByText(/마감 임박순 · 농가 \d+곳/)).toBeVisible();
  const before = await page.getByText(/마감 임박순 · 농가 \d+곳/).innerText();
  const count = before.match(/농가 (\d+)곳/)![1];

  await page.getByLabel("농가 검색").fill("한라네");
  await expect(
    page.getByText("‘한라네’ 검색 결과를 불러오지 못했어요"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "인터넷 연결을 확인하고 다시 시도해 주세요. 아래는 이전 목록이에요.",
    ),
  ).toBeVisible();
  await expect(page.getByText(`이전 목록 · 농가 ${count}곳`)).toBeVisible();
  await expect(page.getByText("찾는 농가가 없어요")).toHaveCount(0);

  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("마감 임박순 · 농가 1곳")).toBeVisible();
  await expect(
    page.getByText("‘한라네’ 검색 결과를 불러오지 못했어요"),
  ).toHaveCount(0);
  await expect(page.getByText("한라네 과수원")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0);
  assertClean();
});
