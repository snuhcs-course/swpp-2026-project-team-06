// DEV-473 (screens.md 3장 ‘화면 오류’): 화면이 그리다 예외로 죽으면 빈 화면 대신 오류 안내가 보이고,
// 탭 안 화면이면 탭 바가 남는다. ‘다시 시도’는 그 화면을 다시 그리고, ‘홈으로’ 뒤 뒤로 가기로 죽은 화면에 갇히지 않는다.
// 일부러 던지는 화면은 제품에 두지 않는다: 이 테스트 안에서만 API 응답의 글자 칸(상품 이름)을 객체로 바꿔
// 실제 화면이 그리다 죽게 만든다(React: Objects are not valid as a React child). 응답을 되돌리면 같은 화면이 살아난다.
// 앱 Mock(npm run dev, 공유 Mock)과 실서버 모두에서 돈다(응답 가로채기는 주소 끝만 본다).
import { expect, test, type Page } from "@playwright/test";

import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

const TITLE = "이 화면을 열지 못했어요";

/** 이 주소의 응답에서 상품 이름을 객체로 바꾼다. 돌려주는 함수를 부르면 원래 응답으로 돌아간다 */
async function breakNames(page: Page, url: RegExp, pick: (body: any) => any[]) {
  const handler = async (route: import("@playwright/test").Route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const item of pick(body)) item.name = { broken: true };
    await route.fulfill({ response, json: body });
  };
  await page.route(url, handler);
  return () => page.unroute(url, handler);
}

async function producerLogin(page: Page, name = "강영수") {
  await skipHelpGuide(page);
  await page.goto(`${producerUrl}/login`);
  await page.getByRole("radio", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: `${name}로 시작하기` }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function consumerLogin(page: Page, name = "김민지") {
  await page.goto(`${consumerUrl}/login`);
  await page.getByRole("radio").filter({ hasText: name }).click();
  await page.getByRole("button", { name: `${name}로 로그인` }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const tabBar = (page: Page) => page.getByRole("tablist");
/** 보이는 오류 안내(다른 탭의 숨은 화면은 빼고) */
const shown = (page: Page) => page.getByText(TITLE).filter({ visible: true });

test("DEV_473 producer tab screen dies → error inside the tab, tab bar stays, retry redraws the list", async ({ page }) => {
  await producerLogin(page);
  const restore = await breakNames(page, /\/api\/products\/mine(\?|$)/, (b) => b.items);
  await page.goto(`${producerUrl}/products`);
  await expect(page.getByText(TITLE)).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(page.getByRole("button", { name: "홈으로" })).toBeVisible();
  await expect(page.getByRole("link", { name: "운영팀에 알리기" })).toBeVisible();
  // 탭 바가 남아 다른 탭으로 옮길 수 있다
  await expect(tabBar(page)).toBeVisible();
  await expect(tabBar(page).getByRole("tab", { name: /채팅/ })).toBeVisible();

  await restore();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(shown(page)).toHaveCount(0);
  await expect(page.getByText("하우스 감귤 5kg / 10kg")).toBeVisible();
  await expect(page).toHaveURL(/\/products(\?|$)/);
});

test("DEV_473 producer pushed screen dies → retry redraws that same screen, not the tab's first screen", async ({ page }) => {
  await producerLogin(page);
  await page.goto(`${producerUrl}/products`);
  await expect(page.getByText("하우스 감귤 5kg / 10kg")).toBeVisible();
  const restore = await breakNames(page, /\/api\/products\/mine\/[^/?]+(\?|$)/, (b) => [b]);
  // 목록에서 연(스택에 쌓인) 하위 화면
  await page.getByRole("button", { name: "물량·판매 설정" }).first().click();
  await expect(page).toHaveURL(/\/products\/[^/]+\/sales/);
  await expect(page.getByText(TITLE)).toBeVisible();
  await expect(tabBar(page)).toBeVisible();

  await restore();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(shown(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/products\/[^/]+\/sales/);
  await expect(page.getByText("현재 판매 한도 (kg)")).toBeVisible();
});

test("DEV_473 home leaves the dead screen: browser back and the tab do not reopen it", async ({ page }) => {
  await producerLogin(page);
  await page.goto(`${producerUrl}/products`);
  await expect(page.getByText("하우스 감귤 5kg / 10kg")).toBeVisible();
  await breakNames(page, /\/api\/products\/mine\/[^/?]+(\?|$)/, (b) => [b]);
  await page.getByRole("button", { name: "물량·판매 설정" }).first().click();
  await expect(page.getByText(TITLE)).toBeVisible();

  await page.getByRole("button", { name: "홈으로" }).click();
  await expect(page).toHaveURL(new RegExp(`^${producerUrl}/?$`));
  await expect(shown(page)).toHaveCount(0);
  await expect(tabBar(page).getByRole("tab", { name: /현황/ })).toHaveAttribute("aria-selected", "true");

  // 브라우저 뒤로: 죽은 하위 화면으로 돌아가지 않는다(응답은 아직 깨진 채)
  await page.goBack();
  await expect(page).not.toHaveURL(/\/sales/);
  await expect(shown(page)).toHaveCount(0);
  // 상품 탭을 다시 눌러도 죽은 화면이 아니라 탭 첫 화면
  await page.goto(`${producerUrl}/`);
  await tabBar(page).getByRole("tab", { name: /상품/ }).click();
  await expect(page).toHaveURL(/\/products(\?|$)/);
  await expect(shown(page)).toHaveCount(0);
});

test("DEV_473 producer support link opens the farmclub room", async ({ page }) => {
  await producerLogin(page);
  await breakNames(page, /\/api\/products\/mine(\?|$)/, (b) => b.items);
  await page.goto(`${producerUrl}/products`);
  await page.getByRole("link", { name: "운영팀에 알리기" }).click();
  await expect(page).toHaveURL(/\/chats\/u-farmclub/);
  await expect(page.getByText("운영팀 문의")).toBeVisible();
});

test("DEV_473 consumer home (tab screen without a layout) dies → error with the tab bar", async ({ page }) => {
  const restore = await breakNames(page, /\/api\/home(\?|$)/, (b) => b.recommended);
  await page.goto(`${consumerUrl}/`);
  await expect(page.getByText(TITLE)).toBeVisible();
  await expect(tabBar(page)).toBeVisible();
  await restore();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(shown(page)).toHaveCount(0);
});

test("DEV_473 consumer screen outside tabs (checkout) dies → root stack boundary, retry and support", async ({ page }) => {
  await consumerLogin(page);
  await page.goto(`${consumerUrl}/products/p-house`);
  // 화면이 막 열린 직후의 누름은 시트를 열지 못할 때가 있어 시트가 보일 때까지 다시 누른다
  await expect(async () => {
    await page.getByRole("button", { name: "예약하기" }).click();
    await expect(page.getByRole("button", { name: "주문서로" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  const restore = await breakNames(page, /\/api\/products\/p-house(\?|$)/, (b) => [b]);
  await page.getByRole("button", { name: "주문서로" }).click();
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  await expect(page.getByText(TITLE)).toBeVisible();
  // 주문서는 원래 탭 바가 없는 작업 화면
  await expect(tabBar(page)).toHaveCount(0);

  await restore();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(shown(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/checkout\/p-house/);
  await expect(page.getByText("주문서").first()).toBeVisible();

  await breakNames(page, /\/api\/products\/p-house(\?|$)/, (b) => [b]);
  // 새로고침 뒤 세션(auth/me)이 서기 전에 누르면 탭 레이아웃이 사용자 키로 다시 만들어지며 첫 화면으로 돌아간다(기존 동작)
  const me = page.waitForResponse(/\/api\/auth\/me(\?|$)/);
  await page.reload();
  await me;
  await expect(page.getByText(TITLE)).toBeVisible();
  await page.getByRole("link", { name: "운영팀에 알리기" }).click();
  await expect(page).toHaveURL(/\/chats\/support/);
});
