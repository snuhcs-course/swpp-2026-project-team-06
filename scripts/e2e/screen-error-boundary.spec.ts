// DEV-473 (screens.md 3장 ‘화면 오류’): 화면이 그리다 예외로 죽으면 빈 화면 대신 오류 안내가 보이고,
// 탭 안 화면이면 탭 바가 남는다. ‘다시 시도’는 그 화면을 다시 그리고, ‘홈으로’ 뒤 뒤로 가기로 죽은 화면에 갇히지 않는다.
// 일부러 던지는 화면은 제품에 두지 않는다: 이 테스트 안에서만 API 응답의 글자 칸(상품 이름)을 객체로 바꿔
// 실제 화면이 그리다 죽게 만든다(React: Objects are not valid as a React child). 응답을 되돌리면 같은 화면이 살아난다.
// 앱 Mock(npm run dev, 공유 Mock)과 실서버 모두에서 돈다(응답 가로채기는 주소 끝만 본다).
import { expect, test, type Page } from "@playwright/test";

import { consumerUrl, producerUrl, skipHelpGuide } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

const TITLE = "이 화면을 열지 못했어요";

/** 이 주소의 응답에서 글자 칸(기본은 상품 이름)을 객체로 바꾼다. 돌려주는 함수를 부르면 원래 응답으로 돌아간다 */
async function breakNames(page: Page, url: RegExp, pick: (body: any) => any[], field = "name") {
  const handler = async (route: import("@playwright/test").Route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const item of pick(body)) item[field] = { broken: true };
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

/** 소비자 상품 화면을 열고 예약하기가 눌릴 때까지. 세션 확인(auth/me) 답을 기다리지 않는다: 답이 와도 탭 아래 화면을
 * 다시 만들지 않는다(DEV-481, `scripts/e2e/session-restore-taps.spec.ts`) */
async function openProduct(page: Page, productId: string) {
  await page.goto(`${consumerUrl}/products/${productId}`);
  await expect(page.getByRole("button", { name: "예약하기" })).toBeEnabled();
}

const tabBar = (page: Page) => page.getByRole("tablist");

/** 생산자 상품 목록의 하우스 감귤 카드(카드 머리 버튼 이름). 상품 이름 글자만으로 찾으면 현황 탭의 물량 카드와 겹친다
 * (실서버 스택에서 두 탭이 함께 그려져 있음) */
const HOUSE = "하우스 감귤 5kg / 10kg";
const houseCard = (page: Page) => page.getByRole("button", { name: `${HOUSE} 상품 수정`, exact: true });
/** 작성 중 한라봉 카드의 ‘판매·가격’ 버튼(스택에 쌓이는 하위 화면). DEV-487에서 ‘물량·판매 설정’ 화면을 없애 바꿨다 */
const draftSell = (page: Page) =>
  page.getByRole("button", { name: "한라봉 5kg 상품 수정", exact: true }).locator("xpath=..").getByRole("button", { name: "판매·가격", exact: true });

/** 탭 바의 탭을 누른다. 개발 서버(npm run dev)는 잡힌 오류도 화면 아래 LogBox 알림으로 띄워 탭 바 왼쪽을 덮으므로
 * (스토어·export 빌드에는 없음) 포인터 대신 키보드(초점 + Enter)로 누른다 */
async function pressTab(page: Page, name: RegExp) {
  await tabBar(page).getByRole("tab", { name }).press("Enter");
}/** 보이는 오류 안내(다른 탭의 숨은 화면은 빼고) */
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
  await expect(houseCard(page)).toBeVisible();
  await expect(page).toHaveURL(/\/products(\?|$)/);
});

test("DEV_473 producer pushed screen dies → retry redraws that same screen, not the tab's first screen", async ({ page }) => {
  await producerLogin(page);
  await page.goto(`${producerUrl}/products?filter=draft`);
  await expect(draftSell(page)).toBeVisible();
  const restore = await breakNames(page, /\/api\/products\/mine\/[^/?]+(\?|$)/, (b) => [b]);
  // 목록에서 연(스택에 쌓인) 하위 화면
  await draftSell(page).click();
  await expect(page).toHaveURL(/\/products\/[^/]+\/sell/);
  await expect(page.getByText(TITLE)).toBeVisible();
  await expect(tabBar(page)).toBeVisible();

  await restore();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(shown(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/products\/[^/]+\/sell/);
  // DEV-452: the sell screen's main button is 최종 미리보기 (then 판매 시작 요청).
  await expect(page.getByRole("button", { name: "최종 미리보기", exact: true })).toBeVisible();
});

test("DEV_473 home leaves the dead screen: browser back and the tab do not reopen it", async ({ page }) => {
  await producerLogin(page);
  await page.goto(`${producerUrl}/products?filter=draft`);
  await expect(draftSell(page)).toBeVisible();
  await breakNames(page, /\/api\/products\/mine\/[^/?]+(\?|$)/, (b) => [b]);
  await draftSell(page).click();
  await expect(page.getByText(TITLE)).toBeVisible();

  await page.getByRole("button", { name: "홈으로" }).click();
  await expect(page).toHaveURL(new RegExp(`^${producerUrl}/?$`));
  await expect(shown(page)).toHaveCount(0);
  await expect(tabBar(page).getByRole("tab", { name: /현황/ })).toHaveAttribute("aria-selected", "true");

  // 페이지를 새로 부르지 않고 앱 안에서: 상품 탭을 다시 눌러도 죽은 화면이 아니라 탭 첫 화면(응답은 아직 깨진 채)
  await pressTab(page, /상품/);
  await expect(page).toHaveURL(/\/products(\?|$)/);
  // 탭은 마지막 필터(작성 중)를 기억한다(DEV-487에서 하위 화면을 작성 중 카드의 판매·가격으로 바꿈)
  await expect(page.getByRole("button", { name: "한라봉 5kg 상품 수정", exact: true })).toBeVisible();
  await expect(shown(page)).toHaveCount(0);
  // 브라우저 뒤로 두 번: 어느 기록도 죽은 하위 화면이 아니다(죽은 화면 기록은 꺼낼 때 탭 첫 화면 주소로 바뀐다)
  for (const _ of [1, 2]) {
    await page.goBack();
    await expect(page).not.toHaveURL(/\/sell/);
    await expect(shown(page)).toHaveCount(0);
  }
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
  await openProduct(page, "p-house");
  await page.getByRole("button", { name: "예약하기" }).click();
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
  await expect(page.getByRole("heading", { name: "주문서", exact: true })).toBeVisible();

  await breakNames(page, /\/api\/products\/p-house(\?|$)/, (b) => [b]);
  await page.reload();
  await expect(page.getByText(TITLE)).toBeVisible();
  await page.getByRole("link", { name: "운영팀에 알리기" }).click();
  await expect(page).toHaveURL(/\/chats\/support/);
});

test("DEV_473 support room itself dies → no support link (it would reopen the same dead room)", async ({ page }) => {
  await consumerLogin(page);
  await breakNames(page, /\/api\/messaging\/support\/messages(\?|$)/, (b) => b.items, "body");
  await page.goto(`${consumerUrl}/chats/support`);
  await expect(page.getByText(TITLE)).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(page.getByRole("link", { name: "운영팀에 알리기" })).toHaveCount(0);
});
