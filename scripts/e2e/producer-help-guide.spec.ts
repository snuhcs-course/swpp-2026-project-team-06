import { expect, test, type Page } from "@playwright/test";
import { apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

const home = new RegExp(`${producerUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`);

async function atStep(page: Page, n: number, title: string) {
  const card = page.getByTestId("tour-card");
  await expect(card.getByText(`${n} / 15`, { exact: true })).toBeVisible();
  await expect(card.getByRole("heading", { name: title })).toBeVisible();
  return card;
}

async function next(page: Page, name: RegExp = /^(다음|시작하기|알겠어요)$/) {
  await page.getByTestId("tour-card").getByRole("button", { name }).click();
}

test("DEV-109: first dashboard visit starts the spotlight tour and walks the real app flow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  await loginProducer(page, "강영수", { helpGuide: true });

  await atStep(page, 1, "farmclub에 오신 걸 환영해요!");
  await next(page);
  await atStep(page, 2, "먼저 상품 탭으로 가 볼까요?");
  // 강조한 곳 밖은 어둡게 막혀 눌리지 않는다
  await page.getByTestId("tab-chats").click({ force: true });
  await expect(page).toHaveURL(home);
  await page.screenshot({ path: testInfo.outputPath("tour-step-2.png") });
  await page.getByTestId("tab-products").click();
  await expect(page).toHaveURL(/\/products$/);

  await atStep(page, 3, "새 상품은 여기서 올려요");
  await page.getByTestId("new-product").click();
  await expect(page).toHaveURL(/\/products\/(manual|source-analysis)/);
  // 자료 분석 켜짐/꺼짐 어느 쪽이든 4단계는 설명(또는 대상 없음 안내) 뒤 '다음'
  await atStep(page, 4, "AI가 상품 정보를 채워 드려요");
  await next(page);
  await atStep(page, 5, "오늘은 구경만 해도 괜찮아요");
  await page.locator('[data-testid="header-back"]:visible').last().click();
  await expect(page).toHaveURL(/\/products$/);

  await atStep(page, 6, "이번엔 손님과 이야기하는 곳이에요");
  await page.getByTestId("tab-chats").click();
  await atStep(page, 7, "소식방: 단골에게 한 번에 알리기");
  await next(page);
  await atStep(page, 8, "1:1 채팅: 손님 질문 모아 보기");
  await page.locator('[data-testid="chat-choice-private"]:visible').click();
  await atStep(page, 9, "대화를 열어 볼까요?");
  await page.locator('[data-testid="chat-row-first"]:visible').click();
  await expect(page).toHaveURL(/\/chats\/[^/?]+/);
  await atStep(page, 10, "반복되는 질문은 AI가 대신 답해 드려요");
  await page.screenshot({ path: testInfo.outputPath("tour-step-10.png") });
  await next(page);
  await atStep(page, 11, "채팅 목록으로 돌아가요");
  await page.locator('[data-testid="header-back"]:visible').last().click();

  await atStep(page, 12, "거의 다 왔어요!");
  await page.getByTestId("tab-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await atStep(page, 13, "AI 응답 설정");
  await page.getByTestId("ai-settings-row").click();
  await expect(page).toHaveURL(/\/farm\/ai-settings/);
  await atStep(page, 14, "AI에게 우리 농가를 알려 주세요");
  await next(page);

  await atStep(page, 15, "다시 보고 싶으면 이 버튼을 누르세요!");
  await expect(page).toHaveURL(home);
  await expect(page.getByText("모르는 게 있으면 운영자에게 편하게 문의해 주세요.", { exact: false })).toBeVisible();
  await next(page, /^알겠어요$/);
  await expect(page.getByTestId("tour-card")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("농가 현황", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "도움말" })).toBeVisible();
  await expect(page.getByTestId("tour-card")).toHaveCount(0);
  assertClean();
});

test("DEV-109: skipping ends the tour for good and the help button restarts it from home", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  await loginProducer(page, "강영수", { helpGuide: true });
  await atStep(page, 1, "farmclub에 오신 걸 환영해요!");
  await page.getByRole("button", { name: "안내 건너뛰기" }).click();
  await expect(page.getByTestId("tour-card")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("농가 현황", { exact: true })).toBeVisible();
  await expect(page.getByTestId("tour-card")).toHaveCount(0);

  for (const path of ["/products", "/chats", "/settings"]) {
    await page.goto(`${producerUrl}${path}`);
    await page.getByRole("button", { name: "도움말" }).click();
    await expect(page).toHaveURL(home);
    await atStep(page, 1, "farmclub에 오신 걸 환영해요!");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tour-card")).toHaveCount(0);
  }
  assertClean();
});

test("DEV-109: a farm with no 1:1 chats skips the room steps", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  await page.route(`${apiUrl}/api/messaging/producer/chats**`, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats`);
  await page.getByRole("button", { name: "도움말" }).click();
  await next(page);
  for (const [n, title, target] of [
    [2, "먼저 상품 탭으로 가 볼까요?", "tab-products"],
    [3, "새 상품은 여기서 올려요", "new-product"],
  ] as const) {
    await atStep(page, n, title);
    await page.getByTestId(target).click();
  }
  await atStep(page, 4, "AI가 상품 정보를 채워 드려요");
  await next(page);
  await page.locator('[data-testid="header-back"]:visible').last().click();
  await atStep(page, 6, "이번엔 손님과 이야기하는 곳이에요");
  await page.getByTestId("tab-chats").click();
  await next(page);
  await page.locator('[data-testid="chat-choice-private"]:visible').click();
  await expect(page.getByText("아직 1:1 대화가 없어요")).toBeVisible();
  await atStep(page, 12, "거의 다 왔어요!");
  assertClean();
});

test("DEV-109: restarting after 1:1 use waits for a real tap and keeps cards on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  // 대화방에서 뒤로 나오면 채팅 탭에 view=private가 남는다
  await page.goto(`${producerUrl}/chats?view=private`);
  await page.locator('[data-testid="chat-row-first"]:visible').click();
  await page.locator('[data-testid="header-back"]:visible').last().click();
  await expect(page).toHaveURL(/view=private/);
  await page.getByTestId("tab-products").click();
  await page.getByRole("button", { name: "도움말" }).click();
  await next(page);
  await page.getByTestId("tab-products").click();
  await atStep(page, 3, "새 상품은 여기서 올려요");
  await page.getByTestId("new-product").click();
  const card = await atStep(page, 4, "AI가 상품 정보를 채워 드려요");
  const box = (await card.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(667);
  await next(page);
  await page.locator('[data-testid="header-back"]:visible').last().click();
  await atStep(page, 6, "이번엔 손님과 이야기하는 곳이에요");
  await page.getByTestId("tab-chats").click();
  await atStep(page, 7, "소식방: 단골에게 한 번에 알리기");
  await expect(page.locator('[data-testid="chat-choice-news"]:visible')).toHaveAttribute("aria-selected", "true");
  await next(page);
  await atStep(page, 8, "1:1 채팅: 손님 질문 모아 보기");
  await page.waitForTimeout(800);
  await atStep(page, 8, "1:1 채팅: 손님 질문 모아 보기");
  await page.locator('[data-testid="chat-choice-private"]:visible').click();
  await atStep(page, 9, "대화를 열어 볼까요?");
  assertClean();
});
