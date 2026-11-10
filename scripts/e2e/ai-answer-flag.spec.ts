// DEV-296 (FEAT-13 AC-13-11·12·13, Figma 10:116·10:158·10:238·10:289·1:62): AI 답변 확인 요청 깃발 흐름.
// 소비자 요청 → 생산자 현황·1:1 목록·대화방에 뜸 → '답이 맞아요'(뒤 인용 답장에도 그대로) / '바로잡기' → 소비자 화면에 결과.
import { expect, test } from "./fixtures";
import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, producerUrl } from "./helpers";

test("FEAT-13 AC-13-11/12/13: flagged AI answer reaches the producer, who confirms one and corrects another", async ({
  page,
  request,
}, info) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // API 키 없이도 전달되지 않는 AI 답변을 받도록 소량 주문 원칙을 저장하고 대화를 AUTO로 돌린다
  const producerToken = await apiLogin(request, "u-kang", "producer");
  const auth = { Authorization: `Bearer ${producerToken}` };
  const settings = await (await request.get(`${apiUrl}/api/farms/me/ai-settings`, { headers: auth })).json();
  expect(
    (
      await request.put(`${apiUrl}/api/farms/me/ai-settings`, {
        headers: { ...auth, "Idempotency-Key": `dev296-settings-${Date.now()}` },
        data: { ...settings, smallOrderPolicy: "1kg부터 주문할 수 있어요." },
      })
    ).ok(),
  ).toBeTruthy();
  const toAuto = async () => {
    const chat = await (
      await request.get(`${apiUrl}/api/messaging/producer/chats/u-seojun/messages`, { headers: auth })
    ).json();
    if (chat.thread.aiMode === "AUTO") return;
    const auto = await request.put(`${apiUrl}/api/messaging/producer/chats/u-seojun/ai-mode`, {
      headers: { ...auth, "Idempotency-Key": `dev296-mode-${Date.now()}` },
      data: { mode: "AUTO", version: chat.thread.version },
    });
    expect(auto.ok()).toBeTruthy();
  };
  // 앞 spec(예: conversation-ui AC-13-5)이 열어 둔 이서준 확인 요청을 닫아, 띠·카드 수가 이 테스트 것만 되게 한다(재시도에도 같음)
  const open = await (
    await request.get(`${apiUrl}/api/messaging/producer/chats/u-seojun/messages?limit=50`, { headers: auth })
  ).json();
  for (const m of open.items ?? [])
    if (m.checkState === "REQUESTED")
      expect(
        (
          await request.post(`${apiUrl}/api/messaging/producer/chats/u-seojun/messages/${m.messageId}/confirm`, {
            headers: { ...auth, "Idempotency-Key": `dev296-clean-${m.messageId}` },
          })
        ).ok(),
      ).toBeTruthy();
  const before = (
    await (await request.get(`${apiUrl}/api/orders/producer/dashboard`, { headers: auth })).json()
  ).todo;
  await toAuto();

  // 1) 소비자: 요청하면 빨간 깃발과 '농가가 확인하면 알려 드려요'
  await loginConsumer(page, "이서준");
  await page.goto(`${consumerUrl}/chats/f-kang?start=1`);
  const input = page.getByRole("textbox", { name: "메시지" });
  // 다른 spec(conversation-ui AC-13-5)의 '소량 주문 되나요?'와 겹치지 않는 문구
  await input.fill(`DEV296 소량 주문 가능할까요 ${Date.now() % 1000}`);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  const report = page.getByRole("button", { name: "답변 확인 요청", exact: true });
  await expect(report).toBeVisible({ timeout: 15_000 });
  await report.click();
  await expect(page.getByText("농가에 확인 요청함", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("농가가 확인하면 알려 드려요", { exact: true }).last()).toBeVisible();
  const followUp = `작년엔 1kg도 받았던 것 같아서요 ${Date.now() % 1000}`;
  await input.fill(followUp);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(followUp, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("consumer-requested.png") });

  // 2) 생산자 현황: '답하지 않은 문의'와 따로 'AI 답변 확인 요청 1건'
  await loginProducer(page, "강영수");
  const todo = page.getByRole("button", { name: `AI 답변 확인 요청 ${(before.aiCheckRequests ?? 0) + 1}건` });
  await expect(todo).toBeVisible({ timeout: 15_000 });
  await todo.click();
  // 3) 1:1 목록: 띠 + 줄 태그, 먼저 보기로 확인 요청 대화만
  await expect(page.getByTestId("ai-check-banner")).toContainText(`확인해 달라는 AI 답변 ${(before.aiCheckRequests ?? 0) + 1}개`);
  await expect(page.getByTestId("ai-check-banner")).toContainText("모두 보기");
  const row = page.getByRole("button", { name: /^이○○, AI 답변 확인 1개/ });
  await expect(row).toBeVisible();
  // 다른 대화에 열린 확인 요청이 없었으면 거른 목록에는 이 대화만 있다
  if (!before.aiCheckRequests) await expect(page.getByRole("button", { name: /^김○○/ })).toHaveCount(0);
  await page.getByTestId("ai-check-banner").click();
  await expect(page.getByTestId("ai-check-banner")).toContainText("먼저 보기");
  await expect(page.getByRole("button", { name: /^김○○/ }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("producer-list.png") });
  await row.click();

  // 4) 대화방: 확인 카드가 덧붙인 말을 인용하고 '답이 맞아요'로 닫는다(새 메시지 없음)
  const card = page.getByTestId("ai-check-card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("이○○님이 이 답변 확인을 요청했어요");
  await expect(card).toContainText(followUp);
  await page.screenshot({ path: info.outputPath("producer-card.png") });
  await card.getByRole("button", { name: "답이 맞아요" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("답이 맞다고 확인함", { exact: true }).last()).toBeVisible();

  // 4-1) 확인한 AI 답변을 인용한 답장은 평범한 답장이다(11/10 PM 결정): 일반 머리글, 확인함 그대로
  const confirmedId = (
    await (
      await request.get(`${apiUrl}/api/messaging/producer/chats/u-seojun/messages?limit=50`, { headers: auth })
    ).json()
  ).items.filter((m: { checkState?: string }) => m.checkState === "CONFIRMED").at(-1).messageId as string;
  // 앞선 실행이 남긴 바로잡기 답장 머리글은 셀 수에서 뺀다(같은 DB 재실행)
  const correctionHeaders = page.getByText("AI 안내를 바로잡아요", { exact: true });
  const earlierHeaders = await correctionHeaders.count();
  await page.getByTestId(`chat-message-${confirmedId}`).click({ button: "right" });
  await page.getByRole("menuitem", { name: "답장", exact: true }).click();
  await expect(page.getByText("선택한 메시지에 답장", { exact: true })).toBeVisible();
  await expect(correctionHeaders).toHaveCount(earlierHeaders);
  const plainReply = `네, 1kg부터 보내 드려요 ${Date.now() % 1000}`;
  await page.getByRole("textbox", { name: "메시지" }).fill(plainReply);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(plainReply, { exact: true })).toBeVisible();
  await expect(correctionHeaders).toHaveCount(earlierHeaders);
  await expect(page.getByTestId(`ai-check-${confirmedId}`)).toHaveText("답이 맞다고 확인함");
  await page.reload();
  await expect(page.getByTestId(`ai-check-${confirmedId}`)).toHaveText("답이 맞다고 확인함", { timeout: 15_000 });
  await page.screenshot({ path: info.outputPath("producer-quoted-confirmed.png") });

  // 5) 소비자: '농가가 답이 맞다고 확인했어요'(앱마다 주소가 달라 로그인이 남아 있다). 인용 답장 뒤에도 그대로
  await page.goto(`${consumerUrl}/chats/f-kang`);
  await expect(page.getByText(plainReply, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`ai-check-${confirmedId}`)).toHaveText("농가가 답이 맞다고 확인했어요");
  await page.screenshot({ path: info.outputPath("consumer-quoted-confirmed.png") });

  // 6) 다른 AI 답변을 요청하고, 농가가 '바로잡기'로 AI 답변을 인용해 답한다
  await toAuto();
  await input.fill(`DEV296 2kg도 소량 주문 돼요 ${Date.now() % 1000}`);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByRole("button", { name: "답변 확인 요청", exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "답변 확인 요청", exact: true }).click();
  await expect(page.getByText("농가에 확인 요청함", { exact: true }).last()).toBeVisible();

  await page.goto(`${producerUrl}/chats/u-seojun`);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: "바로잡기" }).click();
  await expect(page.getByText("AI 안내를 바로잡아요", { exact: true }).last()).toBeVisible();
  const correction = `2kg은 안 되고 5kg부터 보내 드려요 ${Date.now() % 1000}`;
  await page.getByRole("textbox", { name: "메시지" }).fill(correction);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(correction, { exact: true })).toBeVisible();
  await expect(card).toHaveCount(0);

  // 7) 소비자: 바로잡은 AI 답변은 취소선 + '농가가 바로잡았어요', 농가 답장은 AI 답변 인용
  await page.goto(`${consumerUrl}/chats/f-kang`);
  await expect(page.getByText("농가가 바로잡았어요", { exact: true }).last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("AI 안내를 바로잡아요", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(correction, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("consumer-corrected.png") });

  const after = (
    await (await request.get(`${apiUrl}/api/orders/producer/dashboard`, { headers: auth })).json()
  ).todo;
  expect(after.aiCheckRequests).toBe(before.aiCheckRequests ?? 0);
});
