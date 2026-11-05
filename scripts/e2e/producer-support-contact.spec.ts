// 정지·반려 농가의 운영팀 문의 경로(DEV-209, FEAT-34 AC-34-9, FEAT-01 E2·E3)
import { expect, test } from "./fixtures";

import { loginProducer, monitor } from "./helpers";

test("DEV-209 AC-34-9: suspended farm contacts the farmclub team from the suspension screen", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const assertClean = monitor(page);
  await loginProducer(page, "최태호");
  await expect(page).toHaveURL(/\/suspended$/);
  await expect(page.getByText("[운영팀 연락처]")).toHaveCount(0);
  await expect(page.getByTestId("suspend-reason")).toContainText("정지 사유");

  await page.getByRole("button", { name: "운영팀에 문의하기" }).click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByTestId("support-status-note")).toContainText("이 대화방만");
  await expect(page.getByText("계정 정지에 궁금한 점이나 이의가 있으면")).toBeVisible();

  await page.getByLabel("메시지").fill("정지 사유를 자세히 알고 싶어요.");
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText("정지 사유를 자세히 알고 싶어요.")).toBeVisible();

  // 뒤로는 정지 안내로 돌아간다(다른 생산자 화면이 닫혀 있는 것은 scripts/test-producer-gate.mjs가 본다)
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/\/suspended$/);
  assertClean();
  await context.close();
});

test("DEV-209 AC-34-9: rejected farm keeps reapply as the main action and can ask the team", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const assertClean = monitor(page);
  await loginProducer(page, "박순자");
  await expect(page).toHaveURL(/\/pending$/);
  await expect(page.getByText("아래 사유를 고쳐서 다시 신청할 수 있어요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 신청하기" })).toBeVisible();

  await page.getByRole("button", { name: "운영팀에 문의하기" }).click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByText("신청 결과에 궁금한 점이 있으면")).toBeVisible();
  await page.getByRole("button", { name: "뒤로" }).click();
  await expect(page).toHaveURL(/\/pending$/);
  assertClean();
  await context.close();
});
