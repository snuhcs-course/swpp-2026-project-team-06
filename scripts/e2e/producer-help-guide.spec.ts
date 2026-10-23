import { expect, test, type Page } from "./fixtures";
import { apiUrl, loginProducer, monitor, producerUrl } from "./helpers";

const home = new RegExp(`${producerUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?$`);
const TOTAL = 13;

async function atStep(page: Page, n: number, title: string) {
  const card = page.getByTestId("tour-card");
  await expect(card.getByText(`${n} / ${TOTAL}`, { exact: true })).toBeVisible();
  await expect(card.getByRole("heading", { name: title })).toBeVisible();
  return card;
}

async function next(page: Page, name: RegExp = /^(다음|시작하기|알겠어요)$/) {
  await page.getByTestId("tour-card").getByRole("button", { name }).click();
}

// 스택에 같은 화면이 두 번 쌓일 수 있어 보이는 요소만 누른다
const visible = (page: Page, id: string) => page.locator(`[data-testid="${id}"]:visible`).last();

test("DEV-109: first dashboard visit starts the spotlight tour and walks the real app flow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  // 투어는 새 상품(작성 중 상품)을 만들지 않는다
  const workspaceOpens: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/product-workspaces")) workspaceOpens.push(r.url());
  });
  await loginProducer(page, "강영수", { helpGuide: true });

  await atStep(page, 1, "farmclub에 오신 걸 환영해요!");
  await next(page);
  await atStep(page, 2, "먼저 상품 탭으로 가 볼까요?");
  // 강조한 곳 밖은 어둡게 막혀 눌리지 않는다
  await visible(page, "tab-chats").click({ force: true });
  await expect(page).toHaveURL(home);
  await page.screenshot({ path: testInfo.outputPath("tour-step-2.png") });
  await visible(page, "tab-products").click();
  await expect(page).toHaveURL(/\/products$/);

  // '새 상품'은 설명만 한다. 눌러도 들어가지 않아 작성 중 상품이 생기지 않는다
  await atStep(page, 3, "새 상품은 이 버튼으로 올려요");
  await visible(page, "new-product").click({ force: true });
  await expect(page).toHaveURL(/\/products$/);
  await next(page);

  await atStep(page, 4, "이번엔 손님과 이야기하는 곳이에요");
  await visible(page, "tab-chats").click();
  await atStep(page, 5, "소식방: 단골에게 한 번에 알리기");
  await next(page);
  await atStep(page, 6, "1:1 채팅: 손님 질문 모아 보기");
  await visible(page, "chat-choice-private").click();
  await atStep(page, 7, "farmclub 대화방을 열어 볼까요?");
  await visible(page, "chat-row-farmclub").click();
  await expect(page).toHaveURL(/\/chats\/u-farmclub/);
  await atStep(page, 8, "궁금한 건 여기에 물어보세요");
  await page.screenshot({ path: testInfo.outputPath("tour-step-8.png") });
  await next(page);
  await atStep(page, 9, "채팅 목록으로 돌아가요");
  await visible(page, "header-back").click();

  await atStep(page, 10, "거의 다 왔어요!");
  await visible(page, "tab-settings").click();
  await expect(page).toHaveURL(/\/settings$/);
  await atStep(page, 11, "반복되는 질문은 AI가 대신 답해 드려요");
  await visible(page, "ai-settings-row").click();
  await expect(page).toHaveURL(/\/farm\/ai-settings/);
  await atStep(page, 12, "AI에게 우리 농가를 알려 주세요");
  await next(page);

  const card = await atStep(page, 13, "다시 보고 싶으면 이 버튼을 누르세요!");
  await expect(page).toHaveURL(home);
  await expect(card.getByText("모르는 게 있으면 채팅의 farmclub 대화방에 편하게 물어봐 주세요.", { exact: false })).toBeVisible();
  // 본문 속 ? 자리에 실제 도움말 아이콘이 들어간다
  await expect(card.getByRole("img", { name: "도움말" })).toBeVisible();
  await expect(card.getByText("[?]", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("tour-step-13.png") });
  await next(page, /^알겠어요$/);
  await expect(page.getByTestId("tour-card")).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("농가 현황", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "도움말" })).toBeVisible();
  await expect(page.getByTestId("tour-card")).toHaveCount(0);
  expect(workspaceOpens).toEqual([]);
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

test("DEV-109 AC-34-5: without a farmclub room the tour offers Next and skips the room steps", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  await page.route(`${apiUrl}/api/messaging/producer/chats**`, (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats`);
  await page.getByRole("button", { name: "도움말" }).click();
  await next(page);
  await atStep(page, 2, "먼저 상품 탭으로 가 볼까요?");
  await visible(page, "tab-products").click();
  await atStep(page, 3, "새 상품은 이 버튼으로 올려요");
  await next(page);
  await atStep(page, 4, "이번엔 손님과 이야기하는 곳이에요");
  await visible(page, "tab-chats").click();
  await next(page);
  await visible(page, "chat-choice-private").click();
  await atStep(page, 7, "farmclub 대화방을 열어 볼까요?");
  await expect(page.getByText("이 화면에서는 안내할 곳을 찾지 못했어요", { exact: false })).toBeVisible();
  await next(page);
  await atStep(page, 10, "거의 다 왔어요!");
  assertClean();
});

test("DEV-109: restarting after 1:1 use waits for a real tap and keeps cards on a small screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  // 대화방에서 뒤로 나오면 채팅 탭에 view=private가 남는다
  await page.goto(`${producerUrl}/chats?view=private`);
  await visible(page, "chat-row-first").click();
  await visible(page, "header-back").click();
  await expect(page).toHaveURL(/view=private/);
  await visible(page, "tab-products").click();
  await page.getByRole("button", { name: "도움말" }).click();
  await next(page);
  await visible(page, "tab-products").click();
  // 3단계는 본문이 가장 긴 카드다. 작은 화면에서도 화면 안에 있어야 한다
  const card = await atStep(page, 3, "새 상품은 이 버튼으로 올려요");
  const box = (await card.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(667);
  await next(page);
  await atStep(page, 4, "이번엔 손님과 이야기하는 곳이에요");
  await visible(page, "tab-chats").click();
  await atStep(page, 5, "소식방: 단골에게 한 번에 알리기");
  await expect(visible(page, "chat-choice-news")).toHaveAttribute("aria-selected", "true");
  await next(page);
  await atStep(page, 6, "1:1 채팅: 손님 질문 모아 보기");
  // 누르지 않으면 넘어가지 않는다(고정 대기로 부정 조건 확인)
  await page.waitForTimeout(800);
  await atStep(page, 6, "1:1 채팅: 손님 질문 모아 보기");
  await visible(page, "chat-choice-private").click();
  await atStep(page, 7, "farmclub 대화방을 열어 볼까요?");
  assertClean();
});
