import { expect, test, type APIRequestContext } from "@playwright/test";
import { apiUrl, consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

// farmclub 문의 대화방(DEV-111, FEAT-34). 운영자 쪽은 관리 API를 직접 부른다(관리자 페이지는 admin.test.mjs).
const adminToken = process.env.FARMCLUB_ADMIN_TOKEN ?? "";
const admin = (request: APIRequestContext) => ({
  get: (path: string) => request.get(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${adminToken}` } }),
  post: (path: string, data: object) =>
    request.post(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${adminToken}`, "Idempotency-Key": crypto.randomUUID() },
      data,
    }),
});

test.skip(!adminToken, "FARMCLUB_ADMIN_TOKEN이 있어야 운영자 API를 부를 수 있다");

test("AC-34-2 AC-34-3: the farmclub room carries a producer inquiry to the operator and back", async ({ page, request }, testInfo) => {
  // 승인 때 방이 생기는 것(AC-34-1)은 pytest가 맡는다. 공유 DB 상태를 바꾸지 않게 시드의 강영수 방을 쓴다
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  const ops = admin(request);

  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/chats?view=private`);
  const row = page.locator('[data-testid="chat-row-farmclub"]:visible');
  await expect(row).toBeVisible();
  await expect(row).toHaveAccessibleName(/^farmclub, .*안 읽음 1$/);
  await row.click();
  await expect(page).toHaveURL(/\/chats\/u-farmclub/);
  await expect(page.getByTestId("support-intro")).toBeVisible();
  await expect(page.getByText("직접 응대로 전환")).toHaveCount(0);
  // 뒤에 남은 목록 화면의 미리보기와 겹치지 않게 방 안(마지막) 요소를 본다
  await expect(page.getByText(/농가 가입을 환영해요/).last()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("farmclub-room.png") });

  const question = `정산은 언제 들어오나요? ${Date.now()}`;
  await page.getByPlaceholder("메시지를 입력하세요").fill(question);
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText(question).last()).toBeVisible();

  const inbox = await (await ops.get("/admin/support")).json();
  const kang = inbox.find((r: { farmId: string }) => r.farmId === "f-kang");
  expect(kang).toMatchObject({ waiting: true, lastMessage: question });
  const answer = `매주 월요일에 정산돼요. ${Date.now()}`;
  expect((await ops.post("/admin/support/f-kang/messages", { text: answer })).ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByText(answer).last()).toBeVisible();
  await expect(page.getByText("farmclub", { exact: true }).last()).toBeVisible();
  assertClean();
});

test("AC-34-4: consumers never see the farmclub room", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/chats`);
  await expect(page.getByText("채팅").first()).toBeVisible();
  await expect(page.getByText("farmclub 운영팀")).toHaveCount(0);
  await expect(page.getByText(/농가 가입을 환영해요/)).toHaveCount(0);
  assertClean();
});
