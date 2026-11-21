import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { apiLogin, apiUrl, loginProducer, producerUrl, skipHelpGuide } from "./helpers";

// DEV-121: 원산지 표시제도 안내(원산지표시법 제6조 ⑥, 시행규칙 제4조의2 1호 = 초기 화면 상시 게시 + 확인 안내).
// 안 읽은 농가는 현황 할 일 맨 위에서 안내를 열고, '확인했어요'를 누르면 서버에 읽은 시각이 남아 현황 맨 아래 상시 줄로 바뀐다.
// 시드를 새로 넣은 실제 스택에서 돈다(강영수는 안 읽은 상태로 시작).
const shot = (name: string) => process.env.DEV121_SHOTS && `${process.env.DEV121_SHOTS}/${name}.png`;

// 강영수(u-kang)를 안 읽은 상태로 되돌린다. 이 테스트가 읽음을 서버에 남기므로, 되돌리지 않으면
// CI 재시도(retries: 1)·--repeat-each에서 두 번째 실행이 '안내 읽기' 할 일을 못 찾고 떨어진다(2026-11-17 머지 큐 44077432702).
function resetOriginNotice() {
  execFileSync(
    path.resolve("server/.venv/bin/python"),
    [
      "-c",
      `
from sqlalchemy import delete
from sqlalchemy.engine import make_url
from tests import migrations_models
from app.accounts.models import NoticeRead
from app.core.config import get_settings
from app.core.db import get_sessionmaker

cfg = get_settings()
assert cfg.app_env == 'local'
assert make_url(cfg.database_url).host in ('localhost', '127.0.0.1', '::1')
with get_sessionmaker()() as db, db.begin():
 db.execute(delete(NoticeRead).where(NoticeRead.user_id == 'u-kang', NoticeRead.kind == 'ORIGIN'))
`,
    ],
    { cwd: path.resolve("server"), env: { ...process.env, APP_ENV: "local" }, encoding: "utf8", stdio: "pipe" },
  );
}

// 현황은 사용자(/me)만 오면 원산지 줄을 그리고, 할 일·주문 수·물량·공유 줄은 각자 응답이 올 때 위에 끼어든다.
// 그 사이에 누르면 줄이 누르는 도중 아래로 밀려 눌림이 빗나간다(44077432702: 누른 곳 y=363, 물량 응답이 34ms 뒤 도착).
// 화면을 밀어내는 응답이 다 그려진 뒤에 누른다.
async function homeSettled(page: Page) {
  await expect(page.getByRole("button", { name: /^소비자에게 우리 농가 공유하기/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^전체 주문 \d+건$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "예약·출하 물량" })).toBeVisible();
}

test("DEV-121 AC-14-6: unread producer reads the origin notice from the home todo, then it stays as a row", async ({ page, request }) => {
  resetOriginNotice();
  await loginProducer(page, "강영수");
  const todo = page.getByText("원산지 표시제도 안내 읽기", { exact: true });
  await expect(todo).toBeVisible();
  await homeSettled(page);
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
  await expect(page.getByText("원산지 표시제도 안내 읽기", { exact: true })).toHaveCount(0);
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
  await homeSettled(page);
  await page.getByText("원산지 표시제도 안내", { exact: true }).click();
  await expect(page.getByRole("heading", { name: /감귤을 올리기 전에/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인했어요" })).toHaveCount(0);
});

test("DEV-121 DEV-361: product origin field shows the format hint and opens the notice", async ({ page }) => {
  await loginProducer(page, "강영수");
  // DEV-361 PR C: 예전 상품 편집 주소는 상품 수정(composer)으로 간다. 원산지 칸은 상품정보 표 안에 있다
  await page.goto(`${producerUrl}/products/p-house/edit`);
  await expect(page.getByTestId("product-basic-info")).toBeVisible();
  await page.getByText("상품정보", { exact: true }).click();
  // DEV-329(PM 11/15 '안내는 짧게'): 형식 설명은 '표시 방법 보기'에 두고 칸 아래는 예시 한 줄
  const hint = page.getByText("예: 제주산, 서귀포시", { exact: true });
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
