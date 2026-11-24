import path from "node:path";

import { expect, test, type Page } from "./fixtures";
import { consumerUrl, loginConsumer, loginProducer, producerUrl } from "./helpers";

// DEV-467 (FEAT-15 AC-15-12·13). 시드 소식 n-1(최근, 팔로워 전용)·n-2(그 전, 공개)를 쓴다.
// 다른 spec이 답장을 더할 수 있어 개수는 정규식으로 보고, 이 spec이 보낸 글은 매번 다른 글로 찾는다.
const N1 = "첫 바구니 따봤어요. 아직 신맛이 조금 남아서 일주일 더 기다립니다.";
const N2 = "하우스 안 온도가 잘 유지돼서 실측 11.8Brix 나왔어요. 10일 전후로 첫 수확 시작합니다.";
const stamp = () => Date.now().toString(36).replace(/[0-9]/g, (d) => String.fromCharCode(97 + Number(d)));

function card(page: Page, text: string) {
  return page.getByTestId("news-card").filter({ hasText: text });
}

async function openSheet(page: Page, text: string) {
  await page.goto(`${producerUrl}/chats?view=news`);
  await card(page, text).getByRole("button", { name: /^답장 \d+ 모아 보기$/ }).click();
  return page.getByRole("dialog");
}

test("AC-15-12 replying from an older post card files the private reply under that post", async ({ page }) => {
  test.setTimeout(120_000);
  const reply = `하우스 당도 반가워요 ${stamp()}`;
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/news/f-kang`);
  await card(page, N2).getByRole("button", { name: "농가에 답장", exact: true }).click();
  // 입력칸 위에 고른 소식이 보이고 비공개임을 알린다
  const chosen = page.getByTestId("room-reply-post");
  await expect(chosen).toContainText("소식에 답장 · 농가만 봐요");
  await expect(chosen).toContainText(N2.slice(0, 10));
  const box = page.getByRole("textbox", { name: "농가에 답장", exact: true });
  await expect(box).toBeFocused();
  await box.fill(reply);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(reply, { exact: true })).toBeVisible();
  await expect(chosen).toHaveCount(0);

  // 생산자: n-2 카드의 ‘답장 N ›’ 시트에 그 답장이 있다(가장 최근 소식 n-1이 아니라)
  await loginProducer(page, "강영수");
  const sheet = await openSheet(page, N2);
  await expect(sheet.getByTestId("fan-reply-row").filter({ hasText: reply })).toBeVisible();
  await page.getByRole("button", { name: "닫기" }).last().click();
  const latest = await openSheet(page, N1);
  await expect(latest.getByTestId("fan-reply-row").filter({ hasText: reply })).toHaveCount(0);

  // 다른 소비자에게는 보이지 않는다(M-19)
  await loginConsumer(page, "이서준");
  await page.goto(`${consumerUrl}/news/f-kang`);
  await expect(card(page, N2)).toBeVisible();
  await expect(page.getByText(reply, { exact: true })).toHaveCount(0);
});

test("AC-15-13 a consumer attaches a private photo to a reply and the farm sees it in the fan reply sheet", async ({ page }) => {
  test.setTimeout(150_000);
  const reply = `밭 사진 보내요 ${stamp()}`;
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/news/f-kang`);
  // 다른 spec이 더 최근 소식을 올렸을 수 있어 n-1 카드에서 답장한다(고른 소식 + 사진)
  await card(page, N1).getByRole("button", { name: "농가에 답장", exact: true }).click();
  await expect(page.getByTestId("room-reply-post")).toContainText(N1.slice(0, 10));
  // DEV-468: + 메뉴의 사진 동작이 숨긴 파일 칸을 연다. 고른 사진은 기존72px 썸네일.
  await page.getByRole("button", { name: "사진·이모티콘", exact: true }).click();
  await expect(page.getByRole("button", { name: "사진", exact: true })).toBeVisible();
  await expect(page.getByLabel("비공개 사진 첨부", { exact: true })).toBeHidden();
  await page.getByLabel("비공개 사진 첨부", { exact: true }).setInputFiles(
    path.join(process.cwd(), "packages/ui/assets/source/icons/send.png"),
  );
  await expect(page.getByRole("img", { name: "첨부 사진 1", exact: true })).toBeVisible();
  await expect(page.getByTestId("attached-photo-row")).toContainText("1/3");
  await expect(page.getByRole("button", { name: "첨부 사진 1 삭제", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "농가에 답장", exact: true }).fill(reply);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  // 내 답장 말풍선에 사진이 붙고 ‘농가만 봐요’가 함께 보인다. 눌러 크게 본다
  const mine = page.getByText(reply, { exact: true });
  await expect(mine).toBeVisible();
  await page.getByRole("button", { name: "사진·이모티콘", exact: true }).click();
  await expect(page.getByRole("button", { name: "사진", exact: true })).toBeVisible();
  const photo = page.getByRole("img", { name: "답장 사진", exact: true }).last();
  await expect(photo).toBeVisible();
  await page.getByRole("button", { name: "사진 크게 보기" }).last().click();
  await expect(page.getByLabel("크게 본 사진")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).last().click();
  await expect(page.getByLabel("크게 본 사진")).toHaveCount(0);

  // 생산자: n-1 시트의 그 답장 줄에 사진
  await loginProducer(page, "강영수");
  const sheet = await openSheet(page, N1);
  const row = sheet.getByTestId("fan-reply-row").filter({ hasText: reply });
  await expect(row).toBeVisible();
  await expect(row.getByRole("img", { name: "답장 사진", exact: true })).toBeVisible();
});

// 고른 소식이 지워졌거나 사진을 쓸 수 없게 되면 고른 소식·사진만 풀고 쓴 글은 남긴다(DEV-467)
test("AC-15-12 AC-15-13 a deleted target post or unusable photo is cleared with a notice and the text stays", async ({ page }) => {
  test.setTimeout(120_000);
  const draft = `지워진 소식에 쓴 글 ${stamp()}`;
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/news/f-kang`);
  await card(page, N2).getByRole("button", { name: "농가에 답장", exact: true }).click();
  await expect(page.getByTestId("room-reply-post")).toBeVisible();
  const box = page.getByRole("textbox", { name: "농가에 답장", exact: true });
  await box.fill(draft);
  // 보내는 사이 농가가 그 소식을 지웠다(서버 응답 404 + reason)
  await page.route("**/api/messaging/rooms/f-kang/messages", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: "NOT_FOUND", message: "이 소식방의 소식에만 답장할 수 있어요.", details: { reason: "REPLY_TARGET_GONE" } }),
    });
  }, { times: 1 });
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText("삭제된 소식이에요. 최신 소식에 답장해 주세요")).toBeVisible();
  await expect(page.getByTestId("room-reply-post")).toHaveCount(0);
  await expect(box).toHaveValue(draft);

  // 사진이 24시간이 지나 쓸 수 없게 됐다
  await page.getByLabel("비공개 사진 첨부", { exact: true }).setInputFiles(
    path.join(process.cwd(), "packages/ui/assets/source/icons/send.png"),
  );
  await expect(page.getByRole("img", { name: "첨부 사진 1", exact: true })).toBeVisible();
  await page.route("**/api/messaging/rooms/f-kang/messages", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: "NOT_FOUND", message: "사용할 수 없는 첨부예요.", details: { reason: "ATTACHMENT_UNUSABLE" } }),
    });
  }, { times: 1 });
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText("보낼 수 없는 사진을 뺐어요. 사진을 다시 골라 주세요")).toBeVisible();
  await expect(page.getByTestId("attached-photo-row")).toHaveCount(0);
  await expect(box).toHaveValue(draft);
  // 다시 보내면 최신 소식으로 간다(고른 소식 없음)
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(draft, { exact: true })).toBeVisible();
});
