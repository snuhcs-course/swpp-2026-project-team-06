import { expect, test } from "@playwright/test";
import { apiLogin, apiUrl, loginProducer, producerUrl, skipHelpGuide } from "./helpers";

// DEV-121: 원산지 표시제도 안내(원산지표시법 제6조 ⑥, 시행규칙 제4조의2 1호 = 초기 화면 상시 게시 + 확인 안내).
// 안 읽은 농가는 현황 할 일 맨 위에서 안내를 열고, '확인했어요'를 누르면 서버에 읽은 시각이 남아 현황 맨 아래 상시 줄로 바뀐다.
// 시드를 새로 넣은 실제 스택에서 돈다(강영수는 안 읽은 상태로 시작).
const shot = (name: string) => process.env.DEV121_SHOTS && `${process.env.DEV121_SHOTS}/${name}.png`;

test("DEV-121 AC-14-6: unread producer reads the origin notice from the home todo, then it stays as a row", async ({ page, request }) => {
  await loginProducer(page, "강영수");
  const todo = page.getByText("원산지 표시제도 안내를 읽어 주세요", { exact: true });
  await expect(todo).toBeVisible();
  if (shot("after-impl-home-unread")) await page.screenshot({ path: shot("after-impl-home-unread")! });

  await todo.click();
  await expect(page).toHaveURL(/\/origin-notice$/);
  await expect(page.getByRole("heading", { name: /감귤을 올리기 전에/ })).toBeVisible();
  for (const title of ["1. 무엇을, 어떻게 표시해요", "2. 이렇게 하면 안 돼요", "3. 어기면 이렇게 돼요"])
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(/쉽게 풀어 쓴 것이에요/)).toBeVisible();
  if (shot("after-impl-notice")) await page.screenshot({ path: shot("after-impl-notice")! });

  await page.getByRole("button", { name: "확인했어요" }).click();
  await expect(page).not.toHaveURL(/\/origin-notice$/);
  await expect(page.getByText("원산지 표시제도 안내를 읽어 주세요", { exact: true })).toHaveCount(0);
  const row = page.getByText("원산지 표시제도 안내", { exact: true });
  await expect(row).toBeVisible();
  await expect(page.getByText(/월 \d+일 확인함$/).first()).toBeVisible();
  if (shot("after-impl-home-read")) {
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot("after-impl-home-read")! });
  }

  // 서버에 남았다: 새로고침해도 상시 줄, 서버 /me에도 시각
  await page.reload();
  await expect(page.getByText("원산지 표시제도 안내", { exact: true })).toBeVisible();
  const token = await apiLogin(request, "u-kang", "producer");
  const me = await (await request.get(`${apiUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(me.originNoticeReadAt).toBeTruthy();

  // 다시 열면 '확인했어요' 없이 본문만
  await page.getByText("원산지 표시제도 안내", { exact: true }).click();
  await expect(page.getByRole("heading", { name: /감귤을 올리기 전에/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인했어요" })).toHaveCount(0);
});

test("DEV-121: product origin field shows the format hint and opens the notice", async ({ page }) => {
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/p-house/edit`);
  const hint = page.getByText("'국산'·'제주산'처럼 시·도, 시·군·구 이름으로 적어요.", { exact: true });
  await expect(hint).toBeVisible();
  await hint.scrollIntoViewIfNeeded();
  if (shot("after-impl-origin-field")) await page.screenshot({ path: shot("after-impl-origin-field")! });
  await page.getByRole("link", { name: "원산지 표시 방법 보기" }).click();
  await expect(page).toHaveURL(/\/origin-notice$/);
});

test("DEV-121: apply policy sheet lists origin labeling and links to the notice", async ({ page }) => {
  await skipHelpGuide(page);
  await page.goto(`${producerUrl}/login`);
  await page.getByRole("radio", { name: /신규 생산자/ }).click();
  await page.getByRole("button", { name: /시작하기$/ }).click();
  await expect(page).toHaveURL(/\/apply$/);
  await page.getByText("내용 보기", { exact: true }).click();
  const item = page.getByText("원산지 표시", { exact: true });
  await item.scrollIntoViewIfNeeded();
  await expect(item).toBeVisible();
  if (shot("after-impl-apply-policy")) await page.screenshot({ path: shot("after-impl-apply-policy")! });
  await page.getByRole("link", { name: "원산지 표시제도 안내 ›" }).click();
  await expect(page).toHaveURL(/\/origin-notice$/);
  await expect(page.getByRole("heading", { name: /감귤을 올리기 전에/ })).toBeVisible();
});
