import { expect, test, type Page } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, producerUrl } from "./helpers";

// DEV-297 (FEAT-15 AC-15-9·11, Figma 7:90·7:93). 시드 소식 n-1(첫 바구니)과 그 소식에 연결된 시드 답장
// reply-1(김민지, 예약 고객)·reply-2(이서준)를 쓴다. 다른 spec이 같은 소식에 답장을 더할 수 있어 개수는 정규식으로 본다.
// 시드 답장을 읽음·인용 상태로 바꾸므로 스택을 띄울 때마다 시드를 새로 넣는다(CI integration과 같음).
const N1 = "첫 바구니 따봤어요. 아직 신맛이 조금 남아서 일주일 더 기다립니다.";
const MINJI = "첫 바구니 사진 반가워요! 일주일 뒤에 꼭 맛볼게요.";
const SEOJUN = "신맛 빠지면 소식 또 올려 주세요.";

/** n-1 말풍선 묶음(본문과 ‘답장 N ›’을 함께 가진 가장 안쪽 요소) */
function n1Bubble(page: Page) {
  return page
    .locator("div")
    .filter({ hasText: N1 })
    .filter({ has: page.getByRole("button", { name: /^답장 \d+ 모아 보기$/ }) })
    .last();
}

async function openN1Sheet(page: Page) {
  await page.goto(`${producerUrl}/chats?view=news`);
  const bubble = n1Bubble(page);
  await expect(bubble).toBeVisible();
  await bubble.getByRole("button", { name: /^답장 \d+ 모아 보기$/ }).click();
  await expect(page.getByText(/^답장 \d+$/)).toBeVisible();
  return page.getByRole("dialog");
}

function row(page: Page, text: string) {
  return page.getByTestId("fan-reply-row").filter({ hasText: text });
}

test("AC-15-9 follower reading the room counts toward the producer's read line", async ({ page, request }) => {
  test.setTimeout(120_000);
  // 김민지가 소식방을 맨 아래까지 보면 가장 최근 소식까지 읽음이 남는다(화면 변화 없음)
  const reads: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && /\/api\/messaging\/rooms\/f-kang\/read$/.test(r.url())) reads.push(r.url());
  });
  await loginConsumer(page, "김민지");
  await page.goto(`${consumerUrl}/news/f-kang`);
  await expect(page.getByText(N1, { exact: true })).toBeVisible();
  await expect.poll(() => reads.length).toBeGreaterThan(0);
  // 소비자 화면에는 읽음 수·답장 수가 없다
  await expect(page.getByText(/^읽음 \d+$/)).toHaveCount(0);

  const token = await apiLogin(request, "u-kang", "producer");
  const room = await (
    await request.get(`${apiUrl}/api/messaging/rooms/f-kang/messages?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  const n1 = room.items.find((m: { messageId: string }) => m.messageId === "n-1");
  expect(n1.readCount).toBeGreaterThanOrEqual(1);

  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats?view=news`);
  const bubble = n1Bubble(page);
  await expect(bubble.getByText(`읽음 ${n1.readCount}`, { exact: true })).toBeVisible();
  await expect(bubble.getByLabel(new RegExp(`^읽음 ${n1.readCount}, 좋아요 \\d+$`))).toBeVisible();
});

test("AC-15-11 fan reply sheet lists replies, marks them read on open and hands off to quote and 1:1", async ({ page }) => {
  test.setTimeout(150_000);
  await loginProducer(page, "강영수");
  // 시트를 열면 곧바로 읽음 처리(PUT …/replies/read)를 보낸다. 다시 열기 전에 끝난 것을 확인한다
  const marked = page.waitForResponse((r) => r.request().method() === "PUT" && /\/replies\/read$/.test(r.url()));
  const sheet = await openN1Sheet(page);
  await expect(sheet.getByText(/^“첫 바구니 따봤어요\. 아직 신…” · 10월 7일$/)).toBeVisible();
  await expect(sheet.getByRole("tab", { name: /^전체 \d+$/ })).toHaveAttribute("aria-selected", "true");
  const minji = row(page, MINJI);
  const seojun = row(page, SEOJUN);
  await expect(minji.getByText("예약 고객", { exact: true })).toBeVisible();
  await expect(minji.getByTestId("fan-reply-unread")).toBeVisible();
  await expect(seojun.getByTestId("fan-reply-unread")).toBeVisible();
  // ‘안 읽음’ 칩은 처음 연 목록을 거른다
  await sheet.getByRole("tab", { name: /^안 읽음 [1-9]\d*$/ }).click();
  await expect(minji).toBeVisible();
  expect((await marked).ok()).toBeTruthy();
  await page.getByRole("button", { name: "닫기" }).last().click();
  await expect(page.getByText(/^답장 \d+$/)).toHaveCount(0);

  // 다시 열면 열었던 답장은 읽음이다
  const again = await openN1Sheet(page);
  await expect(again.getByRole("tab", { name: "안 읽음 0" })).toBeVisible();
  await expect(row(page, MINJI).getByTestId("fan-reply-unread")).toHaveCount(0);

  // 모두에게 답장 → 시트가 닫히고 입력칸이 익명 인용(DEV-289)으로 바뀐다
  await row(page, SEOJUN).getByRole("button", { name: "모두에게 답장", exact: true }).click();
  await expect(page.getByRole("button", { name: "답장 취소", exact: true })).toBeVisible();
  const answer = `다음 주에 다시 알려 드릴게요 ${Date.now().toString(36).replace(/[0-9]/g, "")}`;
  await page.getByRole("textbox", { name: "모두에게 보낼 소식", exact: true }).fill(answer);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await page.getByRole("button", { name: "확인 · 보내기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "답장 취소", exact: true })).toHaveCount(0);

  // 인용한 답장은 ‘모두에게 답장함 ✓’
  await openN1Sheet(page);
  await expect(row(page, SEOJUN).getByText("모두에게 답장함 ✓", { exact: true })).toBeVisible();
  await expect(row(page, MINJI).getByRole("button", { name: "모두에게 답장", exact: true })).toBeVisible();

  // 1:1 채팅 → 그 소비자의 1:1 대화
  await row(page, MINJI).getByRole("button", { name: "1:1 채팅" }).click();
  await expect(page).toHaveURL(`${producerUrl}/chats/u-minji`);
});
