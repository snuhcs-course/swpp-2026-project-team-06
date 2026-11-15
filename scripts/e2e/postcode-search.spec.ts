// DEV-314 (FEAT-08, screens.md 결정 27, AC-08-4): 배송지 입력의 ‘우편번호 찾기’.
// 카카오 우편번호 스크립트(t1.kakaocdn.net)는 page.route로 가짜를 준다. 테스트가 외부 서비스에 기대지 않고,
// 고른 값이 우편번호·주소 칸에 채워지고 상세 주소로 초점이 가는지, 주문서 도서산간 판정이 같은지 본다.
// 스크립트를 못 받으면 안내를 보이고 직접 입력으로 이어 간다.
// 실서버(FastAPI + 소비자 앱) 대상. 시드 p-house.
import { expect, test } from "./fixtures";
import type { Page } from "./fixtures";

import { apiUrl, consumerUrl, loginConsumer, monitor } from "./helpers";

const SCRIPT = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

/** embed하면 ‘가짜 주소 고르기’ 버튼을 그리고, 누르면 oncomplete에 제주 주소를 넘긴다 */
const STUB = `window.kakao = { Postcode: function (options) {
  this.embed = function (element) {
    var pick = document.createElement("button");
    pick.type = "button";
    pick.textContent = "가짜 주소 고르기";
    pick.onclick = function () {
      options.oncomplete({ zonecode: "63309", roadAddress: "제주특별자치도 제주시 첨단로 242",
        jibunAddress: "제주특별자치도 제주시 영평동 2181", autoRoadAddress: "", autoJibunAddress: "",
        userSelectedType: "R" });
    };
    element.appendChild(pick);
  };
} };`;

/** 우편번호가 5자리가 아닌 결과를 넘기는 가짜(예: 서비스 응답 형식이 바뀜) */
const BAD_STUB = STUB.replace('zonecode: "63309"', 'zonecode: ""');

/** 주문서에서 배송지 입력 하위 화면을 연다(저장 배송지가 있으면 ‘받는 곳 변경’ → ‘새 주소 입력’) */
async function openAddressForm(page: Page) {
  await page.goto(`${consumerUrl}/products/p-house`);
  await page.getByRole("button", { name: "예약하기" }).click();
  const addresses = page.waitForResponse(
    (r) => r.url() === `${apiUrl}/api/auth/me/addresses` && r.request().method() === "GET",
  );
  await page.getByRole("button", { name: "주문서로" }).click();
  if ((await (await addresses).json()).length === 0) {
    await page.getByRole("button", { name: "받는 사람과 주소 입력" }).click();
  } else {
    await page.getByRole("button", { name: "받는 곳 변경" }).click();
    await page.getByRole("button", { name: "새 주소 입력" }).click();
  }
  await expect(page.getByLabel("우편번호", { exact: true })).toBeVisible();
}

test("DEV-314 AC-08-4: postcode search fills postal code and road address, focuses detail, keeps remote fee", async ({
  page,
}) => {
  const assertClean = monitor(page);
  let scriptRequests = 0;
  await page.route(SCRIPT, (route) => {
    scriptRequests += 1;
    return route.fulfill({ status: 200, contentType: "application/javascript", body: STUB });
  });
  await loginConsumer(page);
  await openAddressForm(page);
  // 처리방침 제2조: 화면만 열면 카카오 스크립트를 부르지 않는다
  await page.waitForTimeout(500);
  expect(scriptRequests).toBe(0);

  await page.getByRole("button", { name: "우편번호 찾기" }).click();
  const dialog = page.getByRole("dialog", { name: "우편번호 찾기" });
  await expect(dialog).toBeVisible();
  expect(scriptRequests).toBe(1);
  await dialog.getByRole("button", { name: "가짜 주소 고르기" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByLabel("우편번호", { exact: true })).toHaveValue("63309");
  await expect(page.getByRole("textbox", { name: "주소", exact: true })).toHaveValue(
    "제주특별자치도 제주시 첨단로 242",
  );
  await expect(page.getByLabel("상세 주소")).toBeFocused();

  await page.getByLabel("상세 주소").fill("101호");
  await page.getByLabel("받는 사람").fill("DEV314 구매자");
  await page.getByLabel("연락처").fill("010-1234-5678");
  await page.getByRole("button", { name: "이 주소로 받기" }).click();
  await expect(page.getByText("제주특별자치도 제주시 첨단로 242", { exact: false })).toBeVisible();
  // 직접 입력한 제주 우편번호와 같이 도서산간 추가 운임이 붙는다
  await expect(page.getByText("도서산간 추가 운임", { exact: true })).toBeVisible();
  assertClean();
});

test("DEV-314: closing the search layer leaves the fields as they were", async ({ page }) => {
  const assertClean = monitor(page);
  await page.route(SCRIPT, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: STUB }),
  );
  await loginConsumer(page);
  await openAddressForm(page);
  await page.getByLabel("우편번호", { exact: true }).fill("04001");

  await page.getByRole("button", { name: "우편번호 찾기" }).click();
  const dialog = page.getByRole("dialog", { name: "우편번호 찾기" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("우편번호", { exact: true })).toHaveValue("04001");
  await expect(page.getByRole("button", { name: "우편번호 찾기" })).toBeFocused();
  assertClean();
});

test("DEV-314: when the postcode script cannot load, manual entry still works", async ({ page }) => {
  const assertClean = monitor(page);
  await page.route(SCRIPT, (route) => route.abort());
  await loginConsumer(page);
  await openAddressForm(page);

  await page.getByRole("button", { name: "우편번호 찾기" }).click();
  await expect(
    page.getByText("우편번호 찾기를 열지 못했어요. 우편번호와 주소를 직접 입력해 주세요."),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "우편번호 찾기" })).toHaveCount(0);

  await page.getByLabel("받는 사람").fill("DEV314 구매자");
  await page.getByLabel("연락처").fill("010-1234-5678");
  await page.getByLabel("우편번호", { exact: true }).fill("04001");
  await page.getByRole("textbox", { name: "주소", exact: true }).fill("서울 마포구 월드컵북로 12");
  await page.getByRole("button", { name: "이 주소로 받기" }).click();
  await expect(page.getByText("서울 마포구 월드컵북로 12", { exact: false })).toBeVisible();
  await expect(page.getByText("도서산간 추가 운임", { exact: true })).toHaveCount(0);
  assertClean();
});

test("DEV-314: a picked result without a 5-digit postal code leaves the fields and asks for manual entry", async ({
  page,
}) => {
  const assertClean = monitor(page);
  await page.route(SCRIPT, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: BAD_STUB }),
  );
  await loginConsumer(page);
  await openAddressForm(page);

  await page.getByRole("button", { name: "우편번호 찾기" }).click();
  const dialog = page.getByRole("dialog", { name: "우편번호 찾기" });
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "가짜 주소 고르기" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByText("고른 주소를 채우지 못했어요. 우편번호와 주소를 직접 입력해 주세요."),
  ).toBeVisible();
  await expect(page.getByLabel("우편번호", { exact: true })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "주소", exact: true })).toHaveValue("");
  assertClean();
});
